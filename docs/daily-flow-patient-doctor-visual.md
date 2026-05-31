# Daily Flow Visual (Patient + Doctor)

This is a simple visual flow you can share with non-technical team members.

---

## 1) Full Day Overview

```mermaid
flowchart TD
    A[Start of Day] --> B[Doctor gets morning summary]
    B --> C[Doctor checks menu actions]
    A --> D[Patients send messages during day]
    D --> E[Patient menu and booking/help/info]
    E --> F[Appointments created/managed]
    F --> G[Doctor sees and updates appointments]
    G --> H[End of Day and session expiry]
```

---

## 2) Patient Journey

```mermaid
flowchart TD
    P1[Patient says Hi] --> P2[Bot shows menu]
    P2 -->|Book| P3[Booking collection]
    P2 -->|Services/Location/Timings| P4[Info reply]

    P3 --> P31[Treatment]
    P31 --> P32[Date]
    P32 --> P33[Time]
    P33 --> P34[Patient Name]
    P34 --> P35[Confirmation]
    P35 -->|Confirm| P36[Appointment booked]

    P3 -->|menu/back/cancel/help| P37[Interrupt handling]
    P3 -->|actually/change| P38[Correction handling]
    P3 -->|agent/human| P39[Human escalation]
    P3 -->|emergency words| P40[Emergency guidance]

    P36 --> P41[Book another / Reschedule / Cancel / Main menu]
```

---

## 3) Doctor Journey

```mermaid
flowchart TD
    D1[Doctor opens bot] --> D2[Doctor main menu]

    D2 -->|Today's Appointments| D3[List for today]
    D2 -->|View by Date| D4[Pick/type date]
    D4 --> D5[List for selected date]

    D3 --> D6[Tap appointment detail]
    D5 --> D6
    D6 -->|Mark Completed| D7[Status updated]
    D6 -->|Mark No Show| D8[Status updated]
    D7 --> D9[Patient feedback request sent]

    D2 -->|Manage Schedule| D10[Block/View/Unblock dates]
    D2 -->|View Stats| D11[Stats screen]
```

---

## 4) Daily Automation

```mermaid
flowchart LR
    C1[Cron: Morning summary] --> C2[Doctor gets today's schedule]
    C3[Cron: Reminder run] --> C4[Patients get tomorrow reminder]
    C4 -->|confirm| C5[Bot acknowledges confirmed]
    C4 -->|cancel| C6[Bot starts cancel confirmation flow]
```

---

## 5) Safety and Reliability

```mermaid
flowchart TD
    R1[Incoming webhook message] --> R2[Dedup check]
    R2 --> R3[Normalize and classify intent]
    R3 --> R4[Load session and current state]
    R4 --> R5[Run handlers and transitions]
    R5 --> R6[Send reply]
    R6 --> R7[Save session/message state]
    R5 --> R8[If interactive send fails -> text fallback]
```
