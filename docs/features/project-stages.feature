@zone:dashboard
Feature: Project stages
  As an admin
  I want each project to show where it is in our flow, from inquiry to closed
  So that I know which jobs wait for a quote, an order, the work, reports or billing (ADR-0012)

  # Stages: Inquiry, Quote, Ordered, Scheduled, In work, Reporting, Billing, Closed.

  @task:101
  Scenario: A new project starts at Inquiry
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    When I open "/dashboard/projects/new"
    Then the "Stage" select offers "Inquiry, Quote, Ordered, Scheduled, In work, Reporting, Billing, Closed" with "Inquiry" chosen
    When I fill in "Project name" with "Panel upgrade"
    And I select "Acme Ltd" from "Customer"
    And I select "Haifa warehouse" from "Site"
    And I press "Create Project"
    Then I see the heading "Panel upgrade"
    And the project shows "Inquiry" since today

  @task:101
  Scenario: I move a project to the next stage
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Inquiry"
    When I am on the "Panel upgrade" project page
    And I change the stage to "Quote"
    Then the project shows "Quote" since today

  @task:101
  Scenario: A stage can go back
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Ordered"
    When I am on the "Panel upgrade" project page
    And I change the stage to "Quote"
    Then the project shows "Quote" since today

  @task:101
  Scenario: The projects table shows and filters by stage
    Given I am signed in with an existing account
    And I have projects named "Panel upgrade, Shelf lighting, Fire alarm"
    And the project "Panel upgrade" is at the stage "Quote"
    And the project "Shelf lighting" is at the stage "In work"
    And the project "Fire alarm" is at the stage "Quote"
    When I open "/dashboard/projects"
    Then the "Panel upgrade" row shows "Quote"
    And the "Shelf lighting" row shows "In work"
    When I select "Quote" from "Stage"
    Then the projects shown are "Fire alarm, Panel upgrade"

  @task:101
  Scenario: A canceled project keeps its stage
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    And I press "Cancel project"
    Then I see the text "Canceled"
    And the project shows "Quote" since today
    When I open "/dashboard/projects"
    Then the "Panel upgrade" row shows "Canceled"
    And the "Panel upgrade" row shows "Quote"

  @task:101
  Scenario: A made-up stage is refused
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And I move the project to the stage "Made up" by editing the page
    Then I see the error "Choose a stage"

  @task:101
  Scenario: Who can change a stage
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "Ordered"
    And I am signed in as a user of "Northwind"
    When I am on the "NW Site" project page
    And I change the stage to "Scheduled"
    Then the project shows "Scheduled" since today
    And the auditor opens the "NW Site" project page
    Then the auditor sees the text "Scheduled"
    And the auditor can't move the project to another stage

  @task:101
  Scenario: A worker sees the stage but can't change it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "Ordered"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then I see the text "Ordered"
    And I can't move the project to another stage

  @task:101
  Scenario: Another partner's project's stage can't be changed
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "GX App" is at the stage "Quote"
    And I am signed in as a user of "Northwind"
    When I post a stage change of "GX App" to "Closed"
    Then I see "Something went wrong", the same as with a made-up id
    When I open the address of the "GX App" project
    Then I see "Project not found", the same as for a made-up project address
    And the admin opens the "GX App" project page
    Then the admin sees the text "Quote"

  # Stage checklists and "whose move" (task 120, ADR-0014). Each stage has fixed items marked Us or Customer;
  # the first open item decides the badge: Our move, Waiting for customer, or Ready for next stage when all are done.

  @task:120
  Scenario: The next step card shows the stage's checklist
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    Then the checklist items are "Materials and labour costed, Quote sent to the customer, Customer accepted the quote"
    And the "Next step" section shows "0 of 3 done"
    And the "Next step" section shows "Our move"
    And the project shows "Quote" since today

  @task:120
  Scenario: Ticking items changes whose move it is
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    And I tick "Materials and labour costed"
    And I tick "Quote sent to the customer"
    Then the "Next step" section shows "2 of 3 done"
    And the "Next step" section shows "Waiting for customer"
    When I tick "Customer accepted the quote"
    Then the "Next step" section shows "3 of 3 done"
    And the "Next step" section shows "Ready for next stage"

  @task:120
  Scenario: A ticked item shows who ticked it, and can be unticked
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    And I tick "Materials and labour costed"
    Then "Materials and labour costed" is ticked by me today
    When I untick "Materials and labour costed"
    Then "Materials and labour costed" is not ticked
    And the "Next step" section shows "0 of 3 done"

  @task:120
  Scenario: Ticks stay with their stage
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    And I tick "Materials and labour costed"
    And I change the stage to "Ordered"
    Then the checklist items are "Work order from an authorised person at the customer, Payment terms agreed"
    And the "Next step" section shows "0 of 2 done"
    And the "Next step" section shows "Waiting for customer"
    When I change the stage to "Quote"
    Then the "Next step" section shows "1 of 3 done"
    And "Materials and labour costed" is ticked by me today

  @task:120
  Scenario: Who can tick the checklist
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "Scheduled"
    And I am signed in as a user of "Northwind"
    When I am on the "NW Site" project page
    And I tick "Work date set"
    Then the "Next step" section shows "1 of 3 done"
    And the auditor opens the "NW Site" project page
    Then the auditor sees the text "1 of 3 done"
    And the auditor can't tick the checklist

  @task:120
  Scenario: A worker sees the checklist but can't tick it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "In work"
    And the checklist item "Site visits done" of "NW Site" is ticked
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then the "Next step" section shows "1 of 3 done"
    And the "Next step" section shows "Our move"
    And I can't tick the checklist

  @task:120
  Scenario: Another partner's checklist can't be ticked
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "NW Site" is at the stage "Quote"
    And the project "GX App" is at the stage "Quote"
    And I am signed in as a user of "Northwind"
    When I post a tick of "Quote sent to the customer" on "GX App"
    Then I see "Something went wrong", the same as with a made-up id
    And the admin opens the "GX App" project page
    Then the admin sees the text "0 of 3 done"

  # Leak scenarios from the task 120 access audit.
  @task:120
  Scenario: Another partner's tick can't be unticked
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "GX App" is at the stage "Quote"
    And the checklist item "Quote sent to the customer" of "GX App" is ticked
    And I am signed in as a user of "Northwind"
    When I post an untick of "Quote sent to the customer" on "GX App"
    Then I see "Something went wrong", the same as with a made-up id
    And the admin opens the "GX App" project page
    Then the admin sees the text "1 of 3 done"

  @task:120
  Scenario: A worker on the crew can't tick by posting the form
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "Quote"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I post a tick of "Quote sent to the customer" on "NW Site"
    Then I see "Something went wrong", the same as with a made-up id
    And the admin opens the "NW Site" project page
    Then the admin sees the text "0 of 3 done"

  @task:120
  Scenario: An auditor can't tick by posting the form
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "Quote"
    And I am signed in as an auditor
    When I post a tick of "Quote sent to the customer" on "NW Site"
    Then I see "Something went wrong", the same as with a made-up id
    And the admin opens the "NW Site" project page
    Then the admin sees the text "0 of 3 done"

  @task:120
  Scenario: A deleted project's checklist can't be ticked
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    And the project "Panel upgrade" is deleted in another tab
    And I tick "Materials and labour costed"
    Then I see "Something went wrong", the same as with a made-up id

  # The item texts are the owner's (2026-11-15); the stage label is task 101's.
  @task:120
  Scenario: The checklist in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Panel upgrade" project page
    Then the checklist items are "תמחיר חומרים וכוח אדם, ההצעה נשלחה ללקוח, הלקוח אישר את ההצעה"
    And I see the text "הצעת מחיר"

  # The stage bar and "Move to <next stage>" (task 121). The bar replaces task 101's Stage select and
  # "Change stage" button; three @task:101 scenarios are reworded in the task's first commit (see the task).
  # Phases: Sales (Inquiry, Quote, Ordered), Work (Scheduled, In work), Closing (Reporting, Billing, Closed).

  @task:121
  Scenario: The stage bar shows where the project is
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Scheduled"
    When I am on the "Panel upgrade" project page
    Then the stage bar shows the phases "Sales, Work, Closing"
    And the stage bar shows "Inquiry, Quote, Ordered" done, "Scheduled" current and "In work, Reporting, Billing, Closed" ahead
    When my screen is 360 pixels wide
    And I reload the page
    Then the page does not scroll sideways

  @task:121
  Scenario: Moving on when the checklist is done
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    And the checklist item "Materials and labour costed" of "Panel upgrade" is ticked
    And the checklist item "Quote sent to the customer" of "Panel upgrade" is ticked
    And the checklist item "Customer accepted the quote" of "Panel upgrade" is ticked
    When I am on the "Panel upgrade" project page
    And I press "Move to Ordered"
    Then the project shows "Ordered" since today
    And I do not see the text "Move anyway?"

  @task:121
  Scenario: Moving on with open items asks first
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Quote"
    And the checklist item "Materials and labour costed" of "Panel upgrade" is ticked
    When I am on the "Panel upgrade" project page
    And I press "Move to Ordered"
    Then I see the text "2 items are still open in this stage. Move anyway?"
    When I cancel the move
    Then the project shows "Quote" since today
    And I do not see the text "Move anyway?"
    When I press "Move to Ordered"
    And I press "Move anyway"
    Then the project shows "Ordered" since today

  @task:121
  Scenario: At Closed there is no next stage
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Closed"
    When I am on the "Panel upgrade" project page
    Then the "Next step" section has no button starting with "Move to"
    When I tick "Work-completion report prepared and sent"
    Then the "Next step" section shows "Job complete"
