@zone:dashboard
Feature: Stage board
  As someone in the office
  I want All projects as a board with a column per stage
  So that I see the whole pipeline, whose move each job is, and which jobs have waited too long (task 123)

  # Columns follow the stages under their phases: Sales (Inquiry, Quote, Ordered), Work (Scheduled, In work),
  # Closing (Reporting, Billing, Closed). Whose move comes from the stage's checklist (task 120, ADR-0014).

  @task:123
  Scenario: The board shows a column per stage
    Given I am signed in with an existing account
    And I have projects named "Panel upgrade, Shelf lighting, Fire alarm"
    And the project "Panel upgrade" is at the stage "Quote"
    And the project "Shelf lighting" is at the stage "In work"
    And the project "Fire alarm" is at the stage "Closed"
    When I open "/dashboard/projects"
    And I follow the "Board" link
    Then the board's phases are "Sales, Work, Closing"
    And the "Quote" column lists "Panel upgrade"
    And the "In work" column lists "Shelf lighting"
    And the "Closed" column lists "Fire alarm"
    And the "Inquiry" column is empty

  @task:123
  Scenario: A board card shows whose move and how long
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And I have a project named "Panel upgrade" for customer "Acme Ltd"
    And I have a project named "Fire alarm" for customer "Acme Ltd"
    And the project "Panel upgrade" has been at the stage "Quote" for 12 days
    And the project "Fire alarm" has been at the stage "Quote" for 3 days
    And the checklist item "Materials and labour costed" of "Fire alarm" is ticked
    And the checklist item "Quote sent to the customer" of "Fire alarm" is ticked
    When I open "/dashboard/projects?view=board"
    Then the "Quote" column lists "Panel upgrade, Fire alarm"
    And the "Panel upgrade" project card shows "Acme Ltd"
    And the "Panel upgrade" project card shows "Our move"
    And the "Panel upgrade" project card shows "12 days"
    And the "Panel upgrade" project card shows "more than 7 days in this stage"
    And the "Fire alarm" project card shows "Waiting for customer"
    And the "Fire alarm" project card shows "3 days"
    And the "Fire alarm" project card does not show "more than 7 days in this stage"

  @task:123
  Scenario: The board keeps the filters
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And I have a project named "Panel upgrade" for customer "Acme Ltd"
    And I have a project named "Internal Ops"
    When I open "/dashboard/projects"
    And I select "Acme Ltd" from "Customer"
    And I follow the "Board" link
    Then the "Inquiry" column lists "Panel upgrade"
    And I do not see the "Internal Ops" link
    When I follow the "Table" link
    Then the projects shown are "Panel upgrade"

  @task:123
  Scenario: A partner's board shows only their projects
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" is at the stage "Ordered"
    And the project "GX App" is at the stage "Ordered"
    And I am signed in as a user of "Northwind"
    When I open "/dashboard/projects?view=board"
    Then the "Ordered" column lists "NW Site"
    And the page shows none of "GX App"

  # Leak suite (access audit, task 123): counts, cards and links follow the same access as the table.
  @task:123
  Scenario: A partner's board counts only their projects
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" is at the stage "Ordered"
    And the project "GX App" is at the stage "Ordered"
    And I am signed in as a user of "Northwind"
    When I open "/dashboard/projects?view=board"
    Then the "Ordered" column lists "NW Site"
    And the "Ordered" column's count is 1
    And the "NW Site" project card shows "Acme Ltd"
    And I do not see the "Acme Ltd" link
    And the page shows none of "GX App"

  @task:123
  Scenario: A worker's board shows only their crew's projects
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" is at the stage "In work"
    And the project "GX App" is at the stage "In work"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open "/dashboard/projects?view=board"
    Then the "In work" column lists "NW Site"
    And the "In work" column's count is 1
    And the page shows none of "GX App"

  @task:123
  Scenario: The board leaves out deleted projects and other workspaces' projects
    Given I am signed in with an existing account
    And I have projects named "Panel upgrade, Old job"
    And I delete the project "Old job"
    And I create a workspace named "Side Gig"
    And I have a project named "Garden"
    And I switch to "Test User's workspace"
    When I open "/dashboard/projects?view=board"
    Then the "Inquiry" column lists "Panel upgrade"
    And the "Inquiry" column's count is 1
    And the page shows none of "Old job, Garden"

  @task:123
  Scenario: The board on a phone
    Given I am signed in with an existing account
    And I have projects named "Panel upgrade, Shelf lighting"
    And the project "Shelf lighting" is at the stage "Billing"
    When my screen is 360 pixels wide
    And I open "/dashboard/projects?view=board"
    Then the "Inquiry" column lists "Panel upgrade"
    And the page does not scroll sideways
