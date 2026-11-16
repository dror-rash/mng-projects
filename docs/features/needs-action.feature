@zone:dashboard
Feature: Needs action on the overview
  As someone in the office
  I want the overview to list the jobs that have waited too long, on us or on the customer
  So that nothing stalls unnoticed (task 124)

  # "Waited" counts from the later of the day the stage started and the latest tick in it (ADR-0014).
  # Listed after more than 7 days. Whose move comes from the stage's checklist (task 120).

  @task:124
  Scenario: Needs action lists the projects that waited too long
    Given I am signed in with an existing account
    And I have projects named "Panel upgrade, Shelf lighting, Fire alarm, Door locks, Old warehouse"
    And the project "Panel upgrade" has been at the stage "Quote" for 10 days
    And the project "Shelf lighting" has been at the stage "Quote" for 12 days
    And the checklist item "Materials and labour costed" of "Shelf lighting" was ticked 11 days ago
    And the checklist item "Quote sent to the customer" of "Shelf lighting" was ticked 9 days ago
    And the project "Fire alarm" has been at the stage "Quote" for 3 days
    And the project "Door locks" has been at the stage "Quote" for 10 days
    And the project "Door locks" is canceled
    And the project "Old warehouse" has been at the stage "Closed" for 10 days
    And the checklist item "Work-completion report prepared and sent" of "Old warehouse" was ticked 10 days ago
    When I open "/dashboard"
    Then the "Our move" section shows "Panel upgrade"
    And the "Our move" section shows "10 days"
    And the "Waiting for customer" section shows "Shelf lighting"
    And the "Waiting for customer" section shows "9 days"
    And the "Needs action" section does not show "Fire alarm"
    And the "Needs action" section does not show "Door locks"
    And the "Needs action" section does not show "Old warehouse"

  @task:124
  Scenario: A tick restarts the wait
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" has been at the stage "Quote" for 10 days
    And the checklist item "Materials and labour costed" of "Panel upgrade" was ticked 10 days ago
    When I open "/dashboard"
    Then the "Our move" section shows "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And I tick "Quote sent to the customer"
    And I open "/dashboard"
    Then the "Needs action" section does not show "Panel upgrade"

  @task:124
  Scenario: A partner user sees only their projects in Needs action
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" has been at the stage "Quote" for 10 days
    And the project "GX App" has been at the stage "Quote" for 10 days
    And I am signed in as a user of "Northwind"
    When I open "/dashboard"
    Then the "Our move" section shows "NW Site"
    And the page shows none of "GX App"

  @task:124
  Scenario: A worker sees only their crew's projects in Needs action
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" has been at the stage "In work" for 10 days
    And the project "GX App" has been at the stage "In work" for 10 days
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open "/dashboard"
    Then the "Our move" section shows "NW Site"
    And the page shows none of "GX App"

  @task:124
  Scenario: Nothing needs action
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" has been at the stage "Quote" for 3 days
    When I open "/dashboard"
    Then the "Needs action" section shows "Nothing needs action."
