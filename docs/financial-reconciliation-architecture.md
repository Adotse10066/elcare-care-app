# Financial Reconciliation Architecture

This document describes the architecture of the financial reconciliation system.

## Overview

The financial reconciliation system compares event-derived aggregates with indexed transfer totals to detect drift.

## Components

- FinancialDrift table
- Protocol fee aggregation
- Royalty payment tracking
- Sales reconciliation
- Refund reconciliation

## Data Sources

- Marketplace events
- RoyaltyPayment records
- Transfer events

## Validation Rules

- Drift detection threshold: 100 basis points
- Reconciliation frequency: hourly
- Alert threshold: 500 basis points

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐
│  Events     │────▶│  Aggregates │
└─────────────┘     └─────────────┘
        │
        ▼
┌─────────────┐
│  Comparison │
└─────────────┘
        │
        ▼
┌─────────────┐
│   Alerts    │
└─────────────┘
```

## Maintenance

Regular maintenance tasks:
1. Run reconciliation job hourly
2. Monitor drift alerts
3. Investigate high-severity drifts
