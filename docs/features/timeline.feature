@zone:dashboard
Feature: Project and customer timeline
  As someone following a job
  I want one history of the project, newest first
  So that I see how it went from inquiry to now without opening every section

  @wip @task:108
  Scenario: The project timeline tells the job's story
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" has a communication saying "Asked for a quote"
    And the project "Panel upgrade" is at the stage "Quote"
    And the project "Panel upgrade" has the work order "PO-4471"
    And "Panel upgrade" has a visit 1 days ago with the notes "Measured the panel"
    When I am on the "Panel upgrade" project page
    Then the timeline shows "Measured the panel, Work order PO-4471, Stage: Inquiry → Quote, Asked for a quote"

  @wip @task:108
  Scenario: The timeline shows each person only what they may see
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" has a communication saying "Customer disputes the price"
    And the project "NW Site" is at the stage "Scheduled"
    And the project "NW Site" has the work order "PO-4471"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then the timeline shows "Stage: Inquiry → Scheduled"
    And I do not see the text "Customer disputes the price"
    And I do not see the text "PO-4471"
    And the "Northwind" user opens the "NW Site" project page
    Then the "Northwind" user sees the text "Stage: Inquiry → Scheduled"
    And the auditor opens the "NW Site" project page
    Then the auditor sees the text "Customer disputes the price"

  @wip @task:108
  Scenario: The customer timeline
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the customer "Acme Ltd" has a communication saying "Called about access hours"
    And the project "Panel upgrade" is at the stage "Quote"
    When I am on the "Acme Ltd" customer page
    And I add the note "Prefers WhatsApp"
    Then the timeline shows "Prefers WhatsApp, Panel upgrade: Stage: Inquiry → Quote, Called about access hours"
