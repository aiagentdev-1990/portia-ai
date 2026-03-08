# YieldPilot

An AI-powered portfolio manager designed to automatically optimize yield across DeFi protocols.

## Overview

Today, over $170B is locked in DeFi, and around 36% of DeFi activity involves yield strategies such as lending markets, vaults, and staking. However, managing these opportunities requires constant monitoring of changing APYs and manually reallocating liquidity across protocols. As a result, many users leave capital idle or earning suboptimal yield.

YieldPilot solves this by acting as an AI portfolio manager that continuously analyzes yield opportunities and automatically reallocates liquidity to achieve a target yield specified by the user.

## How It Works

Users interact with the agent through a simple Telegram interface where they can define their target yield. Funds are held securely in a Gnosis Safe, and the AI agent manages the portfolio using a Safe module that allows controlled execution of transactions.

By combining AI decision-making, secure smart contract execution, and automated data collection, YieldPilot enables users to optimize their DeFi portfolios without constant manual management.

## Project Structure

This repository contains three main components:

- **portia-ai/** - AI agent implementation and Telegram bot interface
- **portia-cre/** - Commercial Real Estate DeFi integration
- **portia-portfolio-manager-module/** - Safe module for portfolio management and transaction execution

## Getting Started

[Documentation to be added]

## License

[License to be added]
