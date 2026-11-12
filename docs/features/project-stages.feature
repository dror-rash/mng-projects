@zone:dashboard
Feature: Project stages
  As an admin
  I want each project to show where it is in our flow, from inquiry to closed
  So that I know which jobs wait for a quote, an order, the work, reports or billing (ADR-0012)

  # Stages: Inquiry, Quote, Ordered, Scheduled, In work, Reporting, Billing, Closed.

  @wip @task:101
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

  @wip @task:101
  Scenario: I move a project to the next stage
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Inquiry"
    When I am on the "Panel upgrade" project page
    And I change the stage to "Quote"
    Then the project shows "Quote" since today

  @wip @task:101
  Scenario: A stage can go back
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Ordered"
    When I am on the "Panel upgrade" project page
    And I change the stage to "Quote"
    Then the project shows "Quote" since today

  @wip @task:101
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

  @wip @task:101
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

  @wip @task:101
  Scenario: A made-up stage is refused
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And I choose "Made up" in "Stage" by editing the page
    And I press "Change stage"
    Then I see the error "Choose a stage"

  @wip @task:101
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
    And the auditor sees no "Change stage" button

  @wip @task:101
  Scenario: Another partner's project's stage can't be changed
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the project "GX App" is at the stage "Quote"
    And I am signed in as a user of "Northwind"
    When I post a stage change of "GX App" to "Closed"
    Then I see "Project not found", the same as for a made-up project address
    And the admin opens the "GX App" project page
    Then the admin sees the text "Quote"
