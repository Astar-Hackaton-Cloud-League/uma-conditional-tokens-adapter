const adapterAbi = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "conditionalTokenAddress",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "umaFinderAddress",
                "type": "address"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "usr",
                "type": "address"
            }
        ],
        "name": "AuthorizedUser",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "usr",
                "type": "address"
            }
        ],
        "name": "DeauthorizedUser",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "address",
                "name": "oldFinder",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "newFinder",
                "type": "address"
            }
        ],
        "name": "NewFinderAddress",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "QuestionFlaggedForAdminResolution",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            }
        ],
        "name": "QuestionInitialized",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "QuestionPaused",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "QuestionReset",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "indexed": true,
                "internalType": "bool",
                "name": "emergencyReport",
                "type": "bool"
            }
        ],
        "name": "QuestionResolved",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "indexed": true,
                "internalType": "int256",
                "name": "settledPrice",
                "type": "int256"
            },
            {
                "indexed": true,
                "internalType": "bool",
                "name": "earlyResolution",
                "type": "bool"
            }
        ],
        "name": "QuestionSettled",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "QuestionUnpaused",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            }
        ],
        "name": "QuestionUpdated",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "requestor",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "uint256",
                "name": "requestTimestamp",
                "type": "uint256"
            },
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "identifier",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "indexed": false,
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "indexed": false,
                "internalType": "bool",
                "name": "earlyResolution",
                "type": "bool"
            }
        ],
        "name": "ResolutionDataRequested",
        "type": "event"
    },
    {
        "inputs": [],
        "name": "conditionalTokenContract",
        "outputs": [
            {
                "internalType": "contract IConditionalTokens",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "usr",
                "type": "address"
            }
        ],
        "name": "deny",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "internalType": "uint256[]",
                "name": "payouts",
                "type": "uint256[]"
            }
        ],
        "name": "emergencyReportPayouts",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "emergencySafetyPeriod",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "flagQuestionForEmergencyResolution",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "getExpectedPayouts",
        "outputs": [
            {
                "internalType": "uint256[]",
                "name": "",
                "type": "uint256[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "identifier",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "ignorePrice",
        "outputs": [
            {
                "internalType": "int256",
                "name": "",
                "type": "int256"
            }
        ],
        "stateMutability": "pure",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            }
        ],
        "name": "initializeQuestion",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "isQuestionFlaggedForEmergencyResolution",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "isQuestionInitialized",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "pauseQuestion",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            }
        ],
        "name": "prepareAndInitialize",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "questions",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "settled",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "requestTimestamp",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "adminResolutionTimestamp",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            },
            {
                "internalType": "bool",
                "name": "resolved",
                "type": "bool"
            },
            {
                "internalType": "bool",
                "name": "paused",
                "type": "bool"
            },
            {
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "readyToRequestResolution",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "readyToSettle",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "usr",
                "type": "address"
            }
        ],
        "name": "rely",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "reportPayouts",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "requestResolutionData",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "newFinderAddress",
                "type": "address"
            }
        ],
        "name": "setFinderAddress",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "settle",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "umaFinder",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            }
        ],
        "name": "unPauseQuestion",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "questionID",
                "type": "bytes32"
            },
            {
                "internalType": "bytes",
                "name": "ancillaryData",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "resolutionTime",
                "type": "uint256"
            },
            {
                "internalType": "address",
                "name": "rewardToken",
                "type": "address"
            },
            {
                "internalType": "uint256",
                "name": "reward",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "proposalBond",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "earlyResolutionEnabled",
                "type": "bool"
            }
        ],
        "name": "updateQuestion",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "wards",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

export default adapterAbi;