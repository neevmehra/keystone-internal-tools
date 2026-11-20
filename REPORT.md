# UI review

Base: http://localhost:3000

## Flows

| Flow | Step | OK | Clicks | Note |
| --- | --- | --- | --- | --- |
| maria-request-refund | portal | yes | 0 |  |
| maria-request-refund | open refunds | yes | 1 |  |
| maria-request-refund | start new request | yes | 1 |  |
| maria-request-refund | find transaction | yes | 1 |  |
| maria-request-refund | choose transaction | yes | 1 |  |
| maria-request-refund | fill and submit | yes | 1 |  |
| maria-request-refund | TOTAL | yes | 5 |  |
| dan-approve-from-inbox | portal | yes | 0 |  |
| dan-approve-from-inbox | open notifications | yes | 1 |  |
| dan-approve-from-inbox | open approvals | yes | 1 |  |
| dan-approve-from-inbox | approve first | yes | 1 |  |
| dan-approve-from-inbox | TOTAL | yes | 3 |  |
| olivia-work-dispute | queue | yes | 0 |  |
| olivia-work-dispute | open first unassigned | yes | 1 |  |
| olivia-work-dispute | pick up | yes | 1 |  |
| olivia-work-dispute | save evidence note | yes | 1 |  |
| olivia-work-dispute | mark won | yes | 1 |  |
| olivia-work-dispute | TOTAL | yes | 4 |  |
| maria-command-search | portal | yes | 0 |  |
| maria-command-search | open search with keyboard | yes | 0 |  |
| maria-command-search | type a transaction id | yes | 0 |  |
| maria-command-search | open result | yes | 0 |  |
| maria-command-search | TOTAL | yes | 0 |  |
| priya-request-change | open build | yes | 1 |  |
| priya-request-change | change tab | yes | 1 |  |
| priya-request-change | fill request | yes | 0 |  |
| priya-request-change | submit | yes | 1 |  |
| priya-request-change | TOTAL | yes | 3 |  |
| mobile-nav | open menu | yes | 1 |  |
| mobile-nav | open account menu | yes | 1 |  |
| mobile-nav | search from phone | yes | 1 |  |

## Findings by kind

### overflowing-element (4)

- **refunds-queue-maria** (mobile): table "RefundCustomerAmountReasonStatusRequested byRequestedref_001"
- **audit-alex** (mobile): table "WhenActorToolActionRecordChangesjust nowAlex KimAuditorPlatf"
- **admin-access-matrix** (mobile): a "Access reviews" | a "Evidence pack" | table "Rolepii:readaudit:readaudit:exportapprovals:viewadmin:readre" | table "NameIdP groupsRolesLast sign-inAvery Admina•••@example.compl"
- **chargebacks-queue-olivia** (mobile): table "DisputeCustomerAmountReasonRespond byStatusAssigned todsp_00"

### a11y:scrollable-region-focusable (2)

- **build-request-pending-admin** (desktop): serious: Scrollable region must have keyboard access (1) e.g. pre
- **build-request-simulation-priya** (desktop): serious: Scrollable region must have keyboard access (2) e.g. .max-h-96

### a11y:definition-list (1)

- **build-request-pending-admin** (desktop): serious: <dl> elements must only directly contain properly-ordered <dt> and <dd> groups, <script>, <template> or <div> elements (1) e.g. section > .space-y-2

### small-tap-target (1)

- **build-request-priya** (mobile): 2: input "" 16x16 | input "" 16x16

## Slow pages (warm reload over 2.5s)
