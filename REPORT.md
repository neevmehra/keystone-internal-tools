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

### a11y:color-contrast (10)

- **refunds-queue-maria** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (19) e.g. .hover\:bg-muted\/50.cursor-pointer:nth-child(1) > td:nth-child(5) > .ring-border.bg-muted.ring-1
- **refund-detail-maria** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (1) e.g. .ring-border
- **customer-maria** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (12) e.g. dd > .bg-muted.ring-border.inline-flex
- **refund-detail-alex-masked** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (1) e.g. .ring-border
- **customer-alex-masked** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (5) e.g. dd > .bg-muted.ring-border.inline-flex
- **build-request-pending-admin** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (1) e.g. .bg-destructive\/10
- **refunds-queue-dan** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (19) e.g. .hover\:bg-muted\/50.cursor-pointer:nth-child(1) > td:nth-child(5) > .ring-border.bg-muted.ring-1
- **refund-detail-dan** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (2) e.g. .ring-border
- **chargebacks-writeoff-dan** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (1) e.g. .bg-destructive\/10
- **approvals-priya-own-request** (desktop): serious: Elements must meet minimum color contrast ratio thresholds (3) e.g. .hover\:bg-muted\/50:nth-child(1) > td:nth-child(4) > span > .ml-1\.5.bg-muted.px-1

### small-tap-target (8)

- **refunds-queue-maria** (mobile): 2: button "Amount" 62x16 | button "Requested" 83x16
- **refunds-request-maria** (mobile): 1: a "Refunds" 54x18
- **customer-maria** (mobile): 3: a "Open Refunds" 81x16 | a "ref_demo_pending" 112x16 | a "ref_00163" 63x16
- **audit-alex** (mobile): 42: button "When" 50x16 | button "Actor" 49x16 | button "Tool" 43x16 | button "Action" 54x16 | button "Record" 60x16 | a "Open" 40x14
- **refund-detail-dan** (mobile): 1: a "Refunds" 54x18
- **approvals-dan** (mobile): 3: button "Tool" 43x16 | button "Amount" 62x16 | button "Age" 40x16
- **chargebacks-queue-olivia** (mobile): 3: button "Amount" 62x16 | button "Respond by" 88x16 | button "Status" 54x16
- **build-request-priya** (mobile): 2: input "" 16x16 | input "" 16x16

### overflowing-element (6)

- **refunds-queue-maria** (mobile): table "RefundCustomerAmountReasonStatusRequested byRequestedref_001"
- **customer-maria** (mobile): section "RefundsOpen Refundsref_demo_pendingProduct not received$250." | span "· Maria Lopez: Refund request" | span "· Maria Lopez: Approval request" | span "· ref_demo_pending by Maria Lopez" | time#base-ui-_R_1uhq9bn5ritqkndlb_ "8 hours ago"
- **audit-alex** (mobile): table "WhenActorToolActionRecordChangesjust nowAlex Kimauditorplatf"
- **approvals-dan** (mobile): table "ToolWhatAmountRequested byAgeDecideChargebacksWrite offDispu"
- **admin-access-matrix** (mobile): a "Access reviews" | a "Evidence pack" | table "Rolepii:readaudit:readaudit:exportapprovals:viewadmin:readre" | table "NameIdP groupsRolesLast sign-inAvery Admina•••@example.compl"
- **chargebacks-queue-olivia** (mobile): table "DisputeCustomerAmountReasonRespond byStatusAssigned todsp_00"

### a11y:scrollable-region-focusable (2)

- **build-request-pending-admin** (desktop): serious: Scrollable region must have keyboard access (1) e.g. pre
- **build-request-simulation-priya** (desktop): serious: Scrollable region must have keyboard access (2) e.g. .max-h-96

### a11y:definition-list (1)

- **build-request-pending-admin** (desktop): serious: <dl> elements must only directly contain properly-ordered <dt> and <dd> groups, <script>, <template> or <div> elements (1) e.g. .space-y-5:nth-child(2) > section > dl

### horizontal-scroll (1)

- **customer-maria** (mobile): page is 612px wide in a 390px viewport

## Slow pages (warm reload over 2.5s)
