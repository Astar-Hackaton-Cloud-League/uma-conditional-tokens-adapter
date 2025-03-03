import hre, { deployments, ethers } from "hardhat";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import { MockContract } from "@ethereum-waffle/mock-contract";
import { BigNumber } from "ethers";
import { Griefer, MockConditionalTokens, TestERC20, UmaConditionalTokensBinaryAdapter } from "../../typechain";
import {
    createQuestionID,
    deploy,
    deployMock,
    createAncillaryData,
    hardhatIncreaseTime,
    prepareCondition,
    initializeQuestion,
    takeSnapshot,
    revertToSnapshot,
    getMockRequest,
    createRandomQuestionID,
} from "../helpers";
import { DESC, IGNORE_PRICE, QUESTION_TITLE, emergencySafetyPeriod } from "./constants";

const setup = deployments.createFixture(async () => {
    const signers = await hre.ethers.getSigners();
    const admin = signers[0];

    const conditionalTokens: MockConditionalTokens = await deploy<MockConditionalTokens>("MockConditionalTokens", {
        args: [],
        connect: admin,
    });
    const testRewardToken: TestERC20 = await deploy<TestERC20>("TestERC20", {
        args: ["TestERC20", "TST"],
        connect: admin,
    });

    // Mint a million TST to admin
    await (await testRewardToken.mint(admin.address, BigNumber.from(ethers.utils.parseEther("1000000")))).wait();

    const optimisticOracle: MockContract = await deployMock("OptimisticOracleInterface");
    await optimisticOracle.mock.requestPrice.returns(0);
    await optimisticOracle.mock.settleAndGetPrice.returns(ethers.constants.One);
    await optimisticOracle.mock.setBond.returns(ethers.constants.One);

    const whitelist: MockContract = await deployMock("AddressWhitelistInterface");
    await whitelist.mock.isOnWhitelist.returns(true);

    const finderContract: MockContract = await deployMock("FinderInterface");

    await finderContract.mock.getImplementationAddress
        .withArgs(ethers.utils.formatBytes32String("OptimisticOracle"))
        .returns(optimisticOracle.address);

    await finderContract.mock.getImplementationAddress
        .withArgs(ethers.utils.formatBytes32String("CollateralWhitelist"))
        .returns(whitelist.address);

    const umaBinaryAdapter: UmaConditionalTokensBinaryAdapter = await deploy<UmaConditionalTokensBinaryAdapter>(
        "UmaConditionalTokensBinaryAdapter",
        {
            args: [conditionalTokens.address, finderContract.address],
            connect: admin,
        },
    );

    // Approve TST token with admin signer as owner and adapter as spender
    await (await testRewardToken.connect(admin).approve(umaBinaryAdapter.address, ethers.constants.MaxUint256)).wait();
    return {
        conditionalTokens,
        finderContract,
        optimisticOracle,
        whitelist,
        testRewardToken,
        umaBinaryAdapter,
    };
});

describe("", function () {
    before(async function () {
        this.signers = {};
        const signers = await hre.ethers.getSigners();
        this.signers.admin = signers[0];
        this.signers.deployer = signers[1];
        this.signers.tester = signers[2];
    });

    describe("Uma Conditional Token Binary Adapter", function () {
        describe("setup", function () {
            let conditionalTokens: Contract;
            let umaFinder: MockContract;
            let umaBinaryAdapter: UmaConditionalTokensBinaryAdapter;

            before(async function () {
                const deployment = await setup();
                conditionalTokens = deployment.conditionalTokens;
                umaFinder = deployment.finderContract;
                umaBinaryAdapter = deployment.umaBinaryAdapter;
            });

            it("correctly authorizes users", async function () {
                expect(await umaBinaryAdapter.wards(this.signers.admin.address)).eq(1);
                expect(await umaBinaryAdapter.wards(this.signers.tester.address)).eq(0);

                // Authorize the user
                expect(await umaBinaryAdapter.rely(this.signers.tester.address))
                    .to.emit(umaBinaryAdapter, "AuthorizedUser")
                    .withArgs(this.signers.tester.address);

                // Deauthorize the user
                expect(await umaBinaryAdapter.deny(this.signers.tester.address))
                    .to.emit(umaBinaryAdapter, "DeauthorizedUser")
                    .withArgs(this.signers.tester.address);

                // Attempt to authorize without being authorized
                await expect(
                    umaBinaryAdapter.connect(this.signers.tester).rely(this.signers.tester.address),
                ).to.be.revertedWith("Adapter/not-authorized");
            });

            it("correctly sets up contracts", async function () {
                const returnedConditionalToken = await umaBinaryAdapter.conditionalTokenContract();
                expect(conditionalTokens.address).eq(returnedConditionalToken);

                const finderAddress = await umaBinaryAdapter.umaFinder();
                expect(umaFinder.address).eq(finderAddress);

                const returnedIdentifier = await umaBinaryAdapter.identifier();
                expect(returnedIdentifier).eq("0x5945535f4f525f4e4f5f51554552590000000000000000000000000000000000");
            });
        });

        describe("Question scenarios", function () {
            let conditionalTokens: Contract;
            let optimisticOracle: MockContract;
            let whitelist: MockContract;
            let testRewardToken: TestERC20;
            let umaBinaryAdapter: UmaConditionalTokensBinaryAdapter;

            before(async function () {
                const deployment = await setup();
                conditionalTokens = deployment.conditionalTokens;
                optimisticOracle = deployment.optimisticOracle;
                whitelist = deployment.whitelist;
                testRewardToken = deployment.testRewardToken;
                umaBinaryAdapter = deployment.umaBinaryAdapter;
            });

            it("correctly prepares a question using the adapter as oracle", async function () {
                const oracle = umaBinaryAdapter.address;
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = createQuestionID(title, desc);
                const outcomeSlotCount = 2; // Only YES/NO
                const conditionID = await conditionalTokens.getConditionId(oracle, questionID, outcomeSlotCount);

                expect(await conditionalTokens.prepareCondition(oracle, questionID, outcomeSlotCount))
                    .to.emit(conditionalTokens, "ConditionPreparation")
                    .withArgs(conditionID, oracle, questionID, outcomeSlotCount);
            });

            // Question initialization tests
            it("correctly initializes a question", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = createQuestionID(title, desc);
                const resolutionTime = Math.floor(new Date().getTime() / 1000) + 1000;
                const ancillaryData = createAncillaryData(title, desc);
                const ancillaryDataHexlified = ethers.utils.hexlify(ancillaryData);
                const reward = 0;
                const proposalBond = 0;

                // Verify QuestionInitialized event emitted
                expect(
                    await umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        proposalBond,
                        false,
                    ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionInitialized")
                    .withArgs(
                        questionID,
                        ancillaryDataHexlified,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        proposalBond,
                        false,
                    );

                const returnedQuestionData = await umaBinaryAdapter.questions(questionID);

                // Verify question data stored
                expect(returnedQuestionData.ancillaryData).eq(ancillaryDataHexlified);
                expect(returnedQuestionData.resolutionTime).eq(resolutionTime);
                expect(returnedQuestionData.rewardToken).eq(testRewardToken.address);
                expect(returnedQuestionData.reward).eq(reward);
                // ensure paused defaults to false
                expect(returnedQuestionData.paused).eq(false);
                expect(returnedQuestionData.settled).eq(0);
            });

            it("correctly initializes a question with non-zero rewardToken", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = createQuestionID(title, desc);
                const resolutionTime = Math.floor(new Date().getTime() / 1000) + 1000;
                const ancillaryData = createAncillaryData(title, desc);
                const ancillaryDataHexlified = ethers.utils.hexlify(ancillaryData);
                const reward = ethers.utils.parseEther("10.0");

                // Verify QuestionInitialized event emitted
                expect(
                    await umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        0,
                        false,
                    ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionInitialized")
                    .withArgs(
                        questionID,
                        ancillaryDataHexlified,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        0,
                        false,
                    );

                const returnedQuestionData = await umaBinaryAdapter.questions(questionID);

                // Verify question data stored
                expect(returnedQuestionData.ancillaryData).eq(ancillaryDataHexlified);
                expect(returnedQuestionData.resolutionTime).eq(resolutionTime);
                expect(returnedQuestionData.rewardToken).eq(testRewardToken.address);
                expect(returnedQuestionData.reward).eq(reward);
                expect(returnedQuestionData.proposalBond).eq(0);
            });

            it("correctly initializes a question with non-zero proposalBond and rewardToken", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = createQuestionID(title, desc);
                const resolutionTime = Math.floor(new Date().getTime() / 1000) + 1000;
                const ancillaryData = createAncillaryData(title, desc);
                const ancillaryDataHexlified = ethers.utils.hexlify(ancillaryData);
                const reward = ethers.utils.parseEther("10.0");

                // 10000 TST bond
                const proposalBond = ethers.utils.parseEther("10000.0");

                // Verify QuestionInitialized event emitted
                expect(
                    await umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        proposalBond,
                        false,
                    ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionInitialized")
                    .withArgs(
                        questionID,
                        ancillaryDataHexlified,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        proposalBond,
                        false,
                    );

                const returnedQuestionData = await umaBinaryAdapter.questions(questionID);

                // Verify question data stored
                expect(returnedQuestionData.ancillaryData).eq(ancillaryDataHexlified);
                expect(returnedQuestionData.resolutionTime).eq(resolutionTime);
                expect(returnedQuestionData.rewardToken).eq(testRewardToken.address);
                expect(returnedQuestionData.reward).eq(reward);
                expect(returnedQuestionData.proposalBond).eq(proposalBond);
            });

            it("should revert when trying to reinitialize a question", async function () {
                // init question
                const questionID = createRandomQuestionID();
                const resolutionTime = Math.floor(new Date().getTime() / 1000);
                const ancillaryData = ethers.utils.randomBytes(10);

                await umaBinaryAdapter.initializeQuestion(
                    questionID,
                    ancillaryData,
                    resolutionTime,
                    testRewardToken.address,
                    0,
                    0,
                    false,
                );

                // reinitialize the same questionID
                await expect(
                    umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        0,
                        0,
                        false,
                    ),
                ).to.be.revertedWith("Adapter::initializeQuestion: Question already initialized");
            });

            it("should revert when initializing with an unsupported token", async function () {
                const questionID = createRandomQuestionID();
                const resolutionTime = Math.floor(new Date().getTime() / 1000);
                const ancillaryData = ethers.utils.randomBytes(10);

                // Deploy a new token
                const unsupportedToken: TestERC20 = await deploy<TestERC20>("TestERC20", {
                    args: ["", ""],
                });

                await whitelist.mock.isOnWhitelist.withArgs(unsupportedToken.address).returns(false);

                // Reverts since the token isn't supported
                await expect(
                    umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        unsupportedToken.address,
                        0,
                        0,
                        false,
                    ),
                ).to.be.revertedWith("Adapter::unsupported reward token");
            });

            it("should revert initialization if resolution time is invalid", async function () {
                const questionID = createRandomQuestionID();
                const ancillaryData = ethers.utils.randomBytes(10);
                const resolutionTimestamp = 0;

                // Reverts if resolutionTime == 0
                await expect(
                    umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTimestamp,
                        testRewardToken.address,
                        0,
                        0,
                        false,
                    ),
                ).to.be.revertedWith("Adapter::initializeQuestion: resolutionTime must be positive");
            });

            it("should atomically prepare and initialize a question", async function () {
                const questionID = createRandomQuestionID();
                const resolutionTime = Math.floor(new Date().getTime() / 1000) + 1000;
                const ancillaryData = ethers.utils.randomBytes(10);
                const ancillaryDataHexlified = ethers.utils.hexlify(ancillaryData);
                const reward = ethers.utils.parseEther("10.0");
                const bond = ethers.utils.parseEther("1000.0");

                const conditionID = await conditionalTokens.getConditionId(umaBinaryAdapter.address, questionID, 2);

                expect(
                    await umaBinaryAdapter.prepareAndInitialize(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        bond,
                        false,
                    ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionInitialized")
                    .withArgs(
                        questionID,
                        ancillaryDataHexlified,
                        resolutionTime,
                        testRewardToken.address,
                        reward,
                        bond,
                        false,
                    )
                    .and.to.emit(conditionalTokens, "ConditionPreparation")
                    .withArgs(conditionID, umaBinaryAdapter.address, questionID, 2);
            });

            // RequestResolution tests
            it("should correctly call readyToRequestResolution", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).eq(false);

                // 2 hours ahead
                await hardhatIncreaseTime(7200);
                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).eq(true);
            });

            it("should correctly request resolution data from the OO", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const reward = ethers.constants.Zero;
                const bond = ethers.utils.parseEther("10000.0");

                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    reward,
                    bond,
                    Math.floor(Date.now() / 1000) - 1000,
                );

                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.setBond.returns(bond);

                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).eq(true);

                // Request resolution
                const receipt = await (
                    await umaBinaryAdapter.connect(this.signers.admin).requestResolutionData(questionID)
                ).wait();

                // Ensure ResolutionDataRequested emitted
                expect(receipt.logs.length).to.eq(1);
                const log = receipt.logs[0];
                const evt = await umaBinaryAdapter.interface.parseLog(log);

                const identifier = await umaBinaryAdapter.identifier();
                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify event args
                expect(evt.name).eq("ResolutionDataRequested");
                expect(evt.args.requestor).eq(this.signers.admin.address);
                expect(evt.args.requestTimestamp).eq(questionData.requestTimestamp);
                expect(evt.args.questionID).eq(questionID);
                expect(evt.args.identifier).eq(identifier);
                expect(evt.args.ancillaryData).eq(questionData.ancillaryData);
                expect(evt.args.reward).eq(reward);
                expect(evt.args.rewardToken).eq(testRewardToken.address);
                expect(evt.args.proposalBond).eq(bond);
                expect(evt.args.earlyResolution).eq(false); // Note early resolution is correctly set to false

                // Expect that requestTimestamp is set
                expect(await questionData.requestTimestamp).gt(0);
                expect(await questionData.resolved).eq(false);
            });

            it("should correctly request resolution data with non-zero reward and bond", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const bond = ethers.utils.parseEther("10000.0");
                const reward = ethers.utils.parseEther("10");
                const resolutionTime = Math.floor(Date.now() / 1000) - 2000;

                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    reward,
                    bond,
                    resolutionTime,
                );

                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.setBond.returns(bond);

                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).eq(true);

                const requestorBalance = await testRewardToken.balanceOf(this.signers.admin.address);

                // Request resolution data with the signer paying the reward token
                const receipt = await (
                    await umaBinaryAdapter.connect(this.signers.admin).requestResolutionData(questionID)
                ).wait();

                // Ensure ResolutionDataRequested emitted
                const topic = umaBinaryAdapter.interface.getEventTopic("ResolutionDataRequested");
                const logs = receipt.logs.filter(log => log.topics[0] === topic);
                expect(logs.length).to.eq(1);

                const log = logs[0];
                const evt = await umaBinaryAdapter.interface.parseLog(log);

                const identifier = await umaBinaryAdapter.identifier();
                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify event args
                expect(evt.name).eq("ResolutionDataRequested");
                expect(evt.args.requestor).eq(this.signers.admin.address);
                expect(evt.args.requestTimestamp).eq(questionData.requestTimestamp);
                expect(evt.args.questionID).eq(questionID);
                expect(evt.args.identifier).eq(identifier);
                expect(evt.args.ancillaryData).eq(questionData.ancillaryData);
                expect(evt.args.reward).eq(reward);
                expect(evt.args.rewardToken).eq(testRewardToken.address);
                expect(evt.args.proposalBond).eq(bond);
                expect(evt.args.earlyResolution).eq(false); // Note early resolution is correctly set to false

                // Expect that requestTimestamp is set
                expect(await questionData.requestTimestamp).gt(0);
                expect(await questionData.resolved).eq(false);

                // Verify rewardToken allowance where adapter is owner and OO is spender
                const rewardTokenAllowance: BigNumber = await testRewardToken.allowance(
                    umaBinaryAdapter.address,
                    optimisticOracle.address,
                );
                expect(rewardTokenAllowance).eq(ethers.constants.MaxUint256);

                // Ensure that the price request was paid for by the requestor
                const requestorBalancePost = await testRewardToken.balanceOf(this.signers.admin.address);
                expect(requestorBalance.sub(requestorBalancePost).toString()).to.eq(reward.toString());
            });

            it("should revert if the requestor does not have reward tokens or allowance", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const bond = ethers.utils.parseEther("10000.0");
                const reward = ethers.utils.parseEther("10");
                const resolutionTime = Math.floor(Date.now() / 1000) - 2000;

                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    reward,
                    bond,
                    resolutionTime,
                );

                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.setBond.returns(bond);

                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).eq(true);
                expect(await testRewardToken.balanceOf(this.signers.tester.address)).eq(0);

                await expect(
                    umaBinaryAdapter.connect(this.signers.tester).requestResolutionData(questionID),
                ).to.be.revertedWith("STF");
            });

            it("requestResolutionData should revert if question is not initialized", async function () {
                const questionID = HashZero;
                await expect(umaBinaryAdapter.requestResolutionData(questionID)).to.be.revertedWith(
                    "Adapter::requestResolutionData: Question not ready to be resolved",
                );
            });

            it("requestResolutionData should revert if resolution data previously requested", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                // Request resolution data once
                await (await umaBinaryAdapter.requestResolutionData(questionID)).wait();

                // Re-request resolution data
                // Ensures that setBond on the OO is only called *once*
                await expect(umaBinaryAdapter.requestResolutionData(questionID)).to.be.revertedWith(
                    "Adapter::requestResolutionData: Question not ready to be resolved",
                );
            });

            // Settle tests
            it("should correctly call readyToSettle if resolutionData is available from the OO", async function () {
                // Non existent questionID
                expect(await umaBinaryAdapter.readyToSettle(HashZero)).eq(false);

                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                // When resolutionData is available - resolutionOO::hasPrice returns true,
                await hardhatIncreaseTime(3600);
                await umaBinaryAdapter.requestResolutionData(questionID);
                await optimisticOracle.mock.hasPrice.returns(true);

                expect(await umaBinaryAdapter.readyToSettle(questionID)).eq(true);
            });

            it("should correctly settle a question if it's readyToSettle", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                // Boilerplate/mocks to ensure readyToSettle
                await hardhatIncreaseTime(3600);
                await umaBinaryAdapter.requestResolutionData(questionID);
                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.getRequest.returns(getMockRequest());
                await optimisticOracle.mock.settleAndGetPrice.returns(1);

                // Verify QuestionSettled emitted
                expect(await umaBinaryAdapter.connect(this.signers.tester).settle(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionSettled")
                    .withArgs(questionID, 1, false);

                // Verify settle block number != 0
                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(questionData.settled).to.not.eq(0);

                // Ready to settle should be false, after settling
                const readyToSettle = await umaBinaryAdapter.readyToSettle(questionID);
                expect(readyToSettle).to.eq(false);
            });

            it("should revert if not readyToSettle", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();

                // Settle reverts if:
                // 1. QuestionID is not initialized
                const uninitQuestionID = HashZero;
                await expect(umaBinaryAdapter.connect(this.signers.admin).settle(uninitQuestionID)).to.be.revertedWith(
                    "Adapter::settle: questionID is not ready to be settled",
                );

                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                // 2. if resolutionData is not requested
                await expect(umaBinaryAdapter.connect(this.signers.admin).settle(questionID)).to.be.revertedWith(
                    "Adapter::settle: questionID is not ready to be settled",
                );

                await hardhatIncreaseTime(3600);
                await umaBinaryAdapter.requestResolutionData(questionID);

                await optimisticOracle.mock.settleAndGetPrice.returns(1);
                await optimisticOracle.mock.getRequest.returns(getMockRequest());
                await optimisticOracle.mock.hasPrice.returns(false);

                // 3. If OO doesn't have the price available
                await expect(umaBinaryAdapter.connect(this.signers.admin).settle(questionID)).to.be.revertedWith(
                    "Adapter::settle: questionID is not ready to be settled",
                );

                await optimisticOracle.mock.hasPrice.returns(true);

                // 4. If question is paused
                await (await umaBinaryAdapter.connect(this.signers.admin).pauseQuestion(questionID)).wait();
                await expect(umaBinaryAdapter.connect(this.signers.admin).settle(questionID)).to.be.revertedWith(
                    "Adapter::settle: Question is paused",
                );
                await (await umaBinaryAdapter.connect(this.signers.admin).unPauseQuestion(questionID)).wait();

                // 5. If question is already settled
                await (await umaBinaryAdapter.connect(this.signers.admin).settle(questionID)).wait();
                await expect(umaBinaryAdapter.connect(this.signers.admin).settle(questionID)).to.be.revertedWith(
                    "Adapter::settle: questionID is not ready to be settled",
                );
            });

            // Pause tests
            it("should correctly pause resolution", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                    // set resolutionTime in the past so readyToRequestResolution returns true
                    Math.floor(Date.now() / 1000) - 60 * 60 * 24,
                );

                expect(await umaBinaryAdapter.connect(this.signers.admin).pauseQuestion(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionPaused")
                    .withArgs(questionID);

                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify paused
                expect(questionData.paused).to.eq(true);

                // Verify requestResolutionData reverts if paused
                await expect(
                    umaBinaryAdapter.connect(this.signers.admin).requestResolutionData(questionID),
                ).to.be.revertedWith("Adapter::requestResolutionData: Question is paused");
            });

            it("should correctly unpause resolution", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                    Math.floor(Date.now() / 1000) - 60 * 60 * 24,
                );

                expect(await umaBinaryAdapter.connect(this.signers.admin).unPauseQuestion(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionUnpaused")
                    .withArgs(questionID);

                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify unpaused
                expect(questionData.paused).to.eq(false);
            });

            it("pause should revert when signer is not admin", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                await expect(
                    umaBinaryAdapter.connect(this.signers.tester).pauseQuestion(questionID),
                ).to.be.revertedWith("Adapter/not-authorized");
            });

            it("unpause should revert when signer is not admin", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                await expect(
                    umaBinaryAdapter.connect(this.signers.tester).unPauseQuestion(questionID),
                ).to.be.revertedWith("Adapter/not-authorized");
            });

            it("pause should revert if question is not initialized", async function () {
                await expect(umaBinaryAdapter.connect(this.signers.admin).pauseQuestion(HashZero)).to.be.revertedWith(
                    "Adapter::pauseQuestion: questionID is not initialized",
                );
            });

            it("should disallow atomic settling and resolution", async function () {
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                    Math.floor(Date.now() / 1000) - 60 * 60 * 24,
                );
                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.settleAndGetPrice.returns(1);

                const request = getMockRequest();
                await optimisticOracle.mock.getRequest.returns(request);
                await umaBinaryAdapter.requestResolutionData(questionID);

                const griefer: Griefer = await deploy<Griefer>("Griefer", {
                    args: [umaBinaryAdapter.address],
                    connect: this.signers.admin,
                });

                await expect(griefer.settleAndReport(questionID)).to.be.revertedWith(
                    "Adapter::reportPayouts: Attempting to settle and reportPayouts in the same block",
                );
            });

            it("should correctly update the question", async function () {
                const title = ethers.utils.randomBytes(10).toString();
                const desc = ethers.utils.randomBytes(20).toString();
                const ancillaryData = createAncillaryData(title, desc);

                const questionID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                );

                const newResolutionTime = Math.floor(Date.now() / 1000);
                const newReward = ethers.utils.parseEther("1");
                const newProposalBond = ethers.utils.parseEther("100.0");

                expect(
                    await umaBinaryAdapter
                        .connect(this.signers.admin)
                        .updateQuestion(
                            questionID,
                            ancillaryData,
                            newResolutionTime,
                            testRewardToken.address,
                            newReward,
                            newProposalBond,
                            false,
                        ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionUpdated")
                    .withArgs(
                        questionID,
                        ethers.utils.hexlify(ancillaryData),
                        newResolutionTime,
                        testRewardToken.address,
                        newReward,
                        newProposalBond,
                        false,
                    );

                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify updated properties on the question data
                expect(questionData.resolutionTime.toString()).to.eq(newResolutionTime.toString());
                expect(questionData.reward.toString()).to.eq(newReward.toString());
                expect(questionData.proposalBond).to.eq(newProposalBond.toString());

                // Verify flags on the question data
                expect(questionData.settled).to.eq(0);
                expect(questionData.resolved).to.eq(false);
                expect(questionData.requestTimestamp).to.eq(0);
                expect(questionData.paused).to.eq(false);

                // Update reverts if not an admin
                await expect(
                    umaBinaryAdapter
                        .connect(this.signers.tester)
                        .updateQuestion(
                            questionID,
                            ancillaryData,
                            newResolutionTime,
                            testRewardToken.address,
                            newReward,
                            newProposalBond,
                            false,
                        ),
                ).to.be.revertedWith("Adapter/not-authorized");
            });

            it("should update the finder address", async function () {
                const finderAddress = await umaBinaryAdapter.umaFinder();
                const newFinderAddress = ethers.Wallet.createRandom();
                expect(await umaBinaryAdapter.setFinderAddress(newFinderAddress.address))
                    .to.emit(umaBinaryAdapter, "NewFinderAddress")
                    .withArgs(finderAddress, newFinderAddress.address);
            });

            it("should revert if finder address updater is not the admin", async function () {
                await expect(
                    umaBinaryAdapter
                        .connect(this.signers.tester)
                        .setFinderAddress(ethers.Wallet.createRandom().address),
                ).to.be.revertedWith("Adapter/not-authorized");
            });
        });

        describe("Condition Resolution scenarios", function () {
            let conditionalTokens: Contract;
            let optimisticOracle: MockContract;
            let testRewardToken: TestERC20;
            let umaBinaryAdapter: UmaConditionalTokensBinaryAdapter;
            let questionID: string;
            let bond: BigNumber;
            let snapshot: string;

            beforeEach(async function () {
                // capture hardhat chain snapshot
                snapshot = await takeSnapshot();

                const deployment = await setup();
                conditionalTokens = deployment.conditionalTokens;
                optimisticOracle = deployment.optimisticOracle;
                testRewardToken = deployment.testRewardToken;
                umaBinaryAdapter = deployment.umaBinaryAdapter;

                await optimisticOracle.mock.hasPrice.returns(true);

                questionID = createQuestionID(QUESTION_TITLE, DESC);
                bond = ethers.utils.parseEther("10000.0");

                // prepare condition with adapter as oracle
                await prepareCondition(conditionalTokens, umaBinaryAdapter.address, QUESTION_TITLE, DESC);

                // initialize question
                await initializeQuestion(
                    umaBinaryAdapter,
                    QUESTION_TITLE,
                    DESC,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    bond,
                );

                // fast forward hardhat block time
                await hardhatIncreaseTime(7200);

                // Mock Optimistic Oracle setBond response
                await optimisticOracle.mock.setBond.returns(bond);

                // request resolution data
                await (await umaBinaryAdapter.requestResolutionData(questionID)).wait();

                // settle
                await optimisticOracle.mock.settleAndGetPrice.returns(1);
                const request = getMockRequest();
                await optimisticOracle.mock.getRequest.returns(request);
                await (await umaBinaryAdapter.settle(questionID)).wait();
            });

            afterEach(async function () {
                // revert to snapshot
                await revertToSnapshot(snapshot);
            });

            it("should correctly report [1,0] when YES", async function () {
                const conditionID = await conditionalTokens.getConditionId(umaBinaryAdapter.address, questionID, 2);

                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(conditionalTokens, "ConditionResolution")
                    .withArgs(conditionID, umaBinaryAdapter.address, questionID, 2, [1, 0]);
            });

            it("should correctly report [0,1] when NO", async function () {
                const conditionID = await conditionalTokens.getConditionId(umaBinaryAdapter.address, questionID, 2);
                const request = getMockRequest();
                request.resolvedPrice = ethers.constants.Zero;
                await optimisticOracle.mock.getRequest.returns(request);

                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(conditionalTokens, "ConditionResolution")
                    .withArgs(conditionID, umaBinaryAdapter.address, questionID, 2, [0, 1]);
            });

            it("should correctly report [1,1] when UNKNOWN", async function () {
                const conditionID = await conditionalTokens.getConditionId(umaBinaryAdapter.address, questionID, 2);

                const request = getMockRequest();
                request.resolvedPrice = ethers.utils.parseEther("0.5");
                await optimisticOracle.mock.getRequest.returns(request);

                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(conditionalTokens, "ConditionResolution")
                    .withArgs(conditionID, umaBinaryAdapter.address, questionID, 2, [1, 1]);
            });

            it("reportPayouts emits ConditionResolved if resolution data exists", async function () {
                const conditionID = await conditionalTokens.getConditionId(umaBinaryAdapter.address, questionID, 2);

                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(conditionalTokens, "ConditionResolution")
                    .withArgs(conditionID, umaBinaryAdapter.address, questionID, 2, [1, 0]);
            });

            it("reportPayouts emits QuestionResolved if resolution data exists", async function () {
                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionResolved")
                    .withArgs(questionID, false);

                // Verify resolved flag on the QuestionData struct has been updated
                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(await questionData.requestTimestamp).gt(0);
                expect(await questionData.resolved).eq(true);
            });

            it("reportPayouts reverts if OO returns malformed data", async function () {
                // Mock Optimistic Oracle returns invalid data
                const request = getMockRequest();
                request.resolvedPrice = BigNumber.from(21233);
                await optimisticOracle.mock.getRequest.returns(request);

                await expect(umaBinaryAdapter.reportPayouts(questionID)).to.be.revertedWith(
                    "Adapter::reportPayouts: Invalid resolution data",
                );
            });

            it("reportPayouts reverts if question is paused", async function () {
                await umaBinaryAdapter.connect(this.signers.admin).pauseQuestion(questionID);

                await expect(umaBinaryAdapter.reportPayouts(questionID)).to.be.revertedWith(
                    "Adapter::getExpectedPayouts: Question is paused",
                );
            });

            it("should allow emergency reporting by the admin", async function () {
                // Verify admin resolution timestamp was set to zero upon question initialization
                const questionData = await umaBinaryAdapter.questions(questionID);

                expect(await questionData.adminResolutionTimestamp).to.eq(0);

                // Verify emergency resolution flag check returns false
                expect(await umaBinaryAdapter.isQuestionFlaggedForEmergencyResolution(questionID)).eq(false);

                // flag question for resolution
                expect(await umaBinaryAdapter.flagQuestionForEmergencyResolution(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionFlaggedForAdminResolution")
                    .withArgs(questionID);

                // flag question for resolution should fail second time
                expect(umaBinaryAdapter.flagQuestionForEmergencyResolution(questionID)).to.be.revertedWith(
                    "Adapter::emergencyReportPayouts: questionID is already flagged for emergency resolution",
                );

                // Verify admin resolution timestamp was set
                expect((await umaBinaryAdapter.questions(questionID)).adminResolutionTimestamp).gt(0);

                // Verify emergency resolution flag check returns true
                expect(await umaBinaryAdapter.isQuestionFlaggedForEmergencyResolution(questionID)).eq(true);

                // fast forward the chain to after the emergencySafetyPeriod
                await hardhatIncreaseTime(emergencySafetyPeriod + 1000);

                // YES conditional payout
                const payouts = [1, 0];
                expect(await umaBinaryAdapter.emergencyReportPayouts(questionID, payouts))
                    .to.emit(umaBinaryAdapter, "QuestionResolved")
                    .withArgs(questionID, true);

                // Verify resolved flag on the QuestionData struct has been updated
                expect((await umaBinaryAdapter.questions(questionID)).resolved).eq(true);
            });

            it("should allow emergency reporting even if the question is paused", async function () {
                // Pause question
                await umaBinaryAdapter.connect(this.signers.admin).pauseQuestion(questionID);

                // flag for emergency resolution
                await umaBinaryAdapter.flagQuestionForEmergencyResolution(questionID);

                // fast forward the chain to after the emergencySafetyPeriod
                await hardhatIncreaseTime(emergencySafetyPeriod + 1000);

                // YES conditional payout
                const payouts = [1, 0];
                expect(await umaBinaryAdapter.emergencyReportPayouts(questionID, payouts))
                    .to.emit(umaBinaryAdapter, "QuestionResolved")
                    .withArgs(questionID, true);

                // Verify resolved flag on the QuestionData struct has been updated
                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(await questionData.resolved).eq(true);
            });

            it("should revert if emergencyReport is called before the question is flagged for emergency resolution", async function () {
                // YES conditional payout
                const payouts = [1, 0];
                await expect(umaBinaryAdapter.emergencyReportPayouts(questionID, payouts)).to.be.revertedWith(
                    "Adapter::emergencyReportPayouts: questionID is not flagged for emergency resolution",
                );
            });

            it("should revert if emergencyReport is called before the safety period", async function () {
                // flag for emergency resolution
                await umaBinaryAdapter.flagQuestionForEmergencyResolution(questionID);

                // YES conditional payout
                const payouts = [1, 0];
                await expect(umaBinaryAdapter.emergencyReportPayouts(questionID, payouts)).to.be.revertedWith(
                    "Adapter::emergencyReportPayouts: safety period has not passed",
                );
            });

            it("should revert if emergencyReport is called with invalid payout", async function () {
                // flag for emergency resolution
                await umaBinaryAdapter.flagQuestionForEmergencyResolution(questionID);

                // fast forward the chain to post-emergencySafetyPeriod
                await hardhatIncreaseTime(emergencySafetyPeriod + 1000);

                // invalid conditional payout
                const nonBinaryPayoutVector = [0, 0, 0, 0, 1, 2, 3, 4, 5];
                await expect(
                    umaBinaryAdapter.emergencyReportPayouts(questionID, nonBinaryPayoutVector),
                ).to.be.revertedWith("Adapter::emergencyReportPayouts: payouts must be binary");
            });

            it("should revert if emergencyReport is called from a non-admin", async function () {
                await expect(
                    umaBinaryAdapter.connect(this.signers.tester).emergencyReportPayouts(questionID, [1, 0]),
                ).to.be.revertedWith("Adapter/not-authorized");
            });
        });

        describe("Early Resolution scenarios", function () {
            let conditionalTokens: Contract;
            let optimisticOracle: MockContract;
            let testRewardToken: TestERC20;
            let umaBinaryAdapter: UmaConditionalTokensBinaryAdapter;
            let resolutionTime: number;
            let questionID: string;
            let ancillaryData: Uint8Array;

            before(async function () {
                const deployment = await setup();
                conditionalTokens = deployment.conditionalTokens;
                optimisticOracle = deployment.optimisticOracle;
                testRewardToken = deployment.testRewardToken;
                umaBinaryAdapter = deployment.umaBinaryAdapter;
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                questionID = createQuestionID(title, desc);
                ancillaryData = createAncillaryData(title, desc);
                resolutionTime = Math.floor(new Date().getTime() / 1000) + 2000;

                await prepareCondition(conditionalTokens, umaBinaryAdapter.address, title, desc);
            });

            it("should correctly initialize an early resolution question", async function () {
                const bond = ethers.utils.parseEther("100");
                // Verify QuestionInitialized event emitted
                expect(
                    await umaBinaryAdapter.initializeQuestion(
                        questionID,
                        ancillaryData,
                        resolutionTime,
                        testRewardToken.address,
                        0,
                        bond,
                        true,
                    ),
                )
                    .to.emit(umaBinaryAdapter, "QuestionInitialized")
                    .withArgs(
                        questionID,
                        ethers.utils.hexlify(ancillaryData),
                        resolutionTime,
                        testRewardToken.address,
                        0,
                        bond,
                        true,
                    );

                const returnedQuestionData = await umaBinaryAdapter.questions(questionID);

                // Verify early resolution enabled flag on the questionData
                expect(returnedQuestionData.earlyResolutionEnabled).eq(true);
            });

            it("should request resolution data early", async function () {
                // Verify that ready to request resolution returns true since it's an early resolution
                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).to.eq(true);

                // Request resolution data
                const receipt = await (
                    await umaBinaryAdapter.connect(this.signers.admin).requestResolutionData(questionID)
                ).wait();

                // Ensure ResolutionDataRequested emitted
                const topic = umaBinaryAdapter.interface.getEventTopic("ResolutionDataRequested");
                const logs = receipt.logs.filter(log => log.topics[0] === topic);
                expect(logs.length).to.eq(1);

                const log = logs[0];
                const evt = await umaBinaryAdapter.interface.parseLog(log);

                const identifier = await umaBinaryAdapter.identifier();
                const data = await umaBinaryAdapter.questions(questionID);

                // Verify event args
                expect(evt.name).eq("ResolutionDataRequested");
                expect(evt.args.requestor).eq(this.signers.admin.address);
                expect(evt.args.requestTimestamp).eq(data.requestTimestamp);
                expect(evt.args.questionID).eq(questionID);
                expect(evt.args.identifier).eq(identifier);
                expect(evt.args.ancillaryData).eq(data.ancillaryData);
                expect(evt.args.reward).eq(ethers.constants.Zero);
                expect(evt.args.rewardToken).eq(testRewardToken.address);
                expect(evt.args.proposalBond).eq(ethers.utils.parseEther("100"));

                // Note: early resolution is correctly set to true as this is an early resolution
                expect(evt.args.earlyResolution).eq(true);

                // Verify that the requestTimestamp is set and is less than resolution time
                expect(data.requestTimestamp).to.be.gt(0);
                expect(data.requestTimestamp).to.be.lt(data.resolutionTime);
            });

            it("should revert if resolution data is requested twice", async function () {
                // Attempt to request data again for the same questionID
                await expect(umaBinaryAdapter.requestResolutionData(questionID)).to.be.revertedWith(
                    "Adapter::requestResolutionData: Question not ready to be resolved",
                );
            });

            it("should allow new resolution data requests if OO sent ignore price", async function () {
                await optimisticOracle.mock.hasPrice.returns(true);

                // Optimistic Oracle sends the IGNORE_PRICE to the Adapter
                const request = await getMockRequest();
                request.resolvedPrice = ethers.constants.Zero;
                request.proposedPrice = BigNumber.from(IGNORE_PRICE);
                await optimisticOracle.mock.getRequest.returns(request);
                await optimisticOracle.mock.settleAndGetPrice.returns(IGNORE_PRICE);

                // Verfiy that ready to settle suceeds
                expect(await umaBinaryAdapter.readyToSettle(questionID)).to.eq(true);

                // Attempt to settle the early resolution question
                // Settle emits the QuestionReset event indicating that the question was not settled
                // Ensures that the proposal bond is returned to the price proposer
                expect(await umaBinaryAdapter.connect(this.signers.admin).settle(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionReset")
                    .withArgs(questionID);

                // Allow new price requests by setting requestTimestamp to 0
                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(questionData.requestTimestamp).to.eq(0);
                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).to.eq(true);
            });

            it("should request new resolution data", async function () {
                expect(await umaBinaryAdapter.readyToRequestResolution(questionID)).to.eq(true);

                const receipt = await (
                    await umaBinaryAdapter.connect(this.signers.admin).requestResolutionData(questionID)
                ).wait();

                // Ensure ResolutionDataRequested emitted
                const topic = umaBinaryAdapter.interface.getEventTopic("ResolutionDataRequested");
                const logs = receipt.logs.filter(log => log.topics[0] === topic);
                expect(logs.length).to.eq(1);

                const log = logs[0];
                const evt = await umaBinaryAdapter.interface.parseLog(log);

                const identifier = await umaBinaryAdapter.identifier();
                const questionData = await umaBinaryAdapter.questions(questionID);

                // Verify event args
                expect(evt.name).eq("ResolutionDataRequested");
                expect(evt.args.requestor).eq(this.signers.admin.address);
                expect(evt.args.requestTimestamp).eq(questionData.requestTimestamp);
                expect(evt.args.questionID).eq(questionID);
                expect(evt.args.identifier).eq(identifier);
                expect(evt.args.ancillaryData).eq(questionData.ancillaryData);
                expect(evt.args.reward).eq(ethers.constants.Zero);
                expect(evt.args.rewardToken).eq(testRewardToken.address);
                expect(evt.args.proposalBond).eq(ethers.utils.parseEther("100"));

                // Note: early resolution is correctly set to true as this is an early resolution
                expect(evt.args.earlyResolution).eq(true);

                // Verify that the requestTimestamp is set and is less than resolution time
                expect(questionData.requestTimestamp).to.be.gt(0);
                expect(questionData.requestTimestamp).to.be.lt(questionData.resolutionTime);
            });

            it("should settle the question correctly", async function () {
                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.getRequest.returns(getMockRequest());
                await optimisticOracle.mock.settleAndGetPrice.returns(1);

                // Settle the Question
                expect(await umaBinaryAdapter.connect(this.signers.tester).settle(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionSettled")
                    .withArgs(questionID, 1, true);

                // Verify settled block number != 0
                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(questionData.settled).to.not.eq(0);
            });

            it("should return expected payouts", async function () {
                const expectedPayouts = await (
                    await umaBinaryAdapter.getExpectedPayouts(questionID)
                ).map(el => el.toString());
                expect(expectedPayouts.length).to.eq(2);
                expect(expectedPayouts[0]).to.eq("1");
                expect(expectedPayouts[1]).to.eq("0");
            });

            it("should report payouts correctly", async function () {
                expect(await umaBinaryAdapter.reportPayouts(questionID))
                    .to.emit(umaBinaryAdapter, "QuestionResolved")
                    .withArgs(questionID, false);

                const questionData = await umaBinaryAdapter.questions(questionID);
                expect(await questionData.resolved).eq(true);
            });

            it("should fall back to standard resolution if past the resolution time", async function () {
                // Initialize a new question
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const qID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                    undefined,
                    true,
                );
                // Fast forward time
                await hardhatIncreaseTime(7200);

                // Verify that the question is not an early resolution
                const questionData = await umaBinaryAdapter.questions(qID);
                expect(questionData.requestTimestamp).to.eq(0);

                // request resolution data
                await (await umaBinaryAdapter.requestResolutionData(qID)).wait();

                // Settle using standard resolution
                // mocks for settlement and resolution
                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.getRequest.returns(getMockRequest());
                await optimisticOracle.mock.settleAndGetPrice.returns(1);
                await prepareCondition(conditionalTokens, umaBinaryAdapter.address, title, desc);

                expect(await umaBinaryAdapter.connect(this.signers.tester).settle(qID))
                    .to.emit(umaBinaryAdapter, "QuestionSettled")
                    .withArgs(qID, 1, false); // Note: QuestionSettled event emitted with earlyResolution == false

                // Report payouts
                expect(await umaBinaryAdapter.reportPayouts(qID))
                    .to.emit(umaBinaryAdapter, "QuestionResolved")
                    .withArgs(qID, false);
            });

            it("should reset the question if the OO returns the Ignore price during standard settlement", async function () {
                // Initialize a new question
                const title = ethers.utils.randomBytes(5).toString();
                const desc = ethers.utils.randomBytes(10).toString();
                const qID = await initializeQuestion(
                    umaBinaryAdapter,
                    title,
                    desc,
                    testRewardToken.address,
                    ethers.constants.Zero,
                    ethers.constants.Zero,
                    undefined,
                    true,
                );
                // Fast forward time
                await hardhatIncreaseTime(7200);

                await (await umaBinaryAdapter.requestResolutionData(qID)).wait();

                // Verify requestTimestamp is > 0, i.e resolution data has been requested
                expect((await umaBinaryAdapter.questions(qID)).requestTimestamp).to.gt(0);

                // Settle using standard resolution, with the OO returning the IGNORE_PRICE
                const request = await getMockRequest();
                request.proposedPrice = BigNumber.from(IGNORE_PRICE);
                await optimisticOracle.mock.getRequest.returns(request);
                await optimisticOracle.mock.hasPrice.returns(true);
                await optimisticOracle.mock.settleAndGetPrice.returns(1);

                expect(await umaBinaryAdapter.connect(this.signers.tester).settle(qID))
                    .to.emit(umaBinaryAdapter, "QuestionReset")
                    .withArgs(qID);

                // Verify requestTimestamp is 0, i.e Question has been reset
                const questionData = await umaBinaryAdapter.questions(qID);
                expect(questionData.requestTimestamp).to.eq(0);
            });
        });
    });
});
