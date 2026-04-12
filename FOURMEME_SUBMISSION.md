# Four.Meme AI Sprint - BUIDL Submission Draft

## BUIDL Name
Web3 Health Agent

## One-liner
AI agent that monitors elderly patients' health, catches drug interactions, and anchors tamper-proof records on EVM chains.

## Description (for DoraHacks form)

Web3 Health Agent is an AI-powered healthcare monitoring system that bridges off-chain health data analysis with on-chain integrity proofs.

The core problem: health records for elderly patients get altered, lost, or disputed — and nobody can prove what the original data looked like. Our agent solves this by:

1. Monitoring patient vitals (blood pressure, heart rate, glucose, SpO2) through an MCP server with 6 specialized tools
2. Detecting dangerous drug interactions in real-time (e.g., Warfarin + Aspirin severity classification)
3. Generating personalized care plans with medication schedules
4. Anchoring keccak256 hashes of every health event on-chain as tamper-proof integrity proofs

Patients control access through an on-chain ConsentManager with scoped permissions (per data type), time-based expiry, and instant revocation. No provider can access data without valid on-chain consent.

The system uses two Solidity contracts:
- HealthDataRegistry: stores integrity hashes for 5 record types (VITALS, DRUG_INTERACTION, CARE_PLAN, LAB_RESULT, ALERT)
- ConsentManager: patient-controlled data access with scope-based permissions

Everything is EVM-compatible — works on BNB Chain, Ethereum, Polygon, or any EVM chain.

47 tests passing. Built with Hardhat + ethers.js v6 + MCP Protocol.

## Track
AI Agent / AI x Web3

## Tech Stack
- Solidity 0.8.24
- Hardhat + ethers.js v6
- MCP (Model Context Protocol)
- Vanilla HTML/CSS/JS frontend dashboard

## GitHub Link
https://github.com/asdc163/web3-health-agent

## Demo Video
[TODO: Record and upload 2-3 min demo]

## Team
Solo developer

## What was built during the hackathon
- Complete smart contract suite (HealthDataRegistry + ConsentManager)
- On-chain bridge connecting AI agent outputs to blockchain
- MCP server with 6 healthcare tools
- Interactive dashboard with real-time monitoring
- 47 comprehensive tests (unit + integration)
