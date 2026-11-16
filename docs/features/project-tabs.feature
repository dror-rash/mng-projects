@zone:dashboard
Feature: Project page tabs
  As someone working on a job
  I want the project page split into tabs that follow the flow, opening on the tab of the current stage
  So that what this stage needs is in front of me (task 122)

  # Tabs: Overview (site, tasks), Sales (work orders and quotes, later), Work (visits, readings, photos and
  # files, crew), Reports (reports), Billing (bills, later). The header, the stage bar and "Next step" show on
  # every tab. Projects written by fixtures start at Inquiry, so they open on Overview. Pages and actions that
  # lead back to the project return to the tab they belong to; a stage move opens the new stage's tab.

  @task:122
  Scenario Outline: The project page opens on the current stage's tab
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "<stage>"
    When I am on the "Panel upgrade" project page
    Then the "<tab>" tab is open

    Examples:
      | stage     | tab      |
      | Inquiry   | Overview |
      | Quote     | Sales    |
      | Ordered   | Sales    |
      | Scheduled | Work     |
      | In work   | Work     |
      | Reporting | Reports  |
      | Billing   | Billing  |
      | Closed    | Reports  |

  @task:122
  Scenario: Each tab shows its own sections
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And the project has a task "Order breakers"
    Then the "Overview" tab is open
    And the page shows the sections "Site, To do, In progress, Done"
    When I open the "Work" tab
    Then the page shows the sections "Visits, Readings, Photos and files, Crew"
    And I do not see the task "Order breakers"
    When I open the "Reports" tab
    Then the page shows the sections "Reports"

  @task:122
  Scenario: A tab has its own address
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "In work"
    When I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    And I reload the page
    Then the "Reports" tab is open
    When I open the "Panel upgrade" project page with "?tab=overview" in its address
    Then the "Overview" tab is open
    When I open the "Panel upgrade" project page with "?tab=made-up" in its address
    Then the "Work" tab is open

  @task:122
  Scenario: Sales and Billing say what will come
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And I open the "Sales" tab
    Then I see the text "Quotes and work orders will show here."
    When I open the "Billing" tab
    Then I see the text "Bills will show here."

  @task:122
  Scenario: The tabs on a phone, in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a project named "Panel upgrade"
    And the project "Panel upgrade" is at the stage "Billing"
    When my screen is 360 pixels wide
    And I am on the "Panel upgrade" project page
    Then the "חיוב" tab is open
    And the page is right to left
    And the page does not scroll sideways
    When I open the "דוחות" tab
    Then the "דוחות" tab is open

  @task:122
  Scenario: Coming back to the tab I was on
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    And the project "Panel upgrade" is at the stage "Reporting"
    When I am on the "Panel upgrade" project page
    Then the "Reports" tab is open
    When I open the "Work" tab
    And I tick "Report prepared in the office"
    Then the "Work" tab is open
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I follow the "Panel upgrade" link
    Then the "Work" tab is open
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I press "Delete visit"
    Then the "Work" tab is open
    And the visits listed are ""
    When I change the stage to "Billing"
    Then the "Billing" tab is open

  @task:122
  Scenario: A task's page leads back to the Overview tab
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And I am on the "Panel upgrade" project page
    And the project has a task "Order breakers"
    And the project has a task "Label circuits"
    And the project "Panel upgrade" is at the stage "In work"
    When I follow the "Order breakers" link
    And I follow the "Panel upgrade" link
    Then the "Overview" tab is open
    When I follow the "Label circuits" link
    And I press "Delete task"
    Then the "Overview" tab is open
    And I do not see the task "Label circuits"

  @task:122
  Scenario: A worker lands on the Work tab
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" is at the stage "In work"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then the "Work" tab is open
    And the page shows the sections "Visits, Readings, Photos and files, Crew"
    And I see the "Record a visit" link

  @task:122
  Scenario: Another partner's project is not found on any tab
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And I am signed in as a user of "Northwind"
    When I open the address of the "GX App" project with "?tab=work"
    Then I see "Project not found", the same as for a made-up project address
    When I open the address of the "GX App" project with "?tab=reports"
    Then I see "Project not found", the same as for a made-up project address

  @task:122
  Scenario: A worker can't open the Work tab of a project they're not on the crew of
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the address of the "GX App" project with "?tab=work"
    Then I see "Project not found", the same as for a made-up project address

  @task:122
  Scenario: A partner's user on the Work tab doesn't manage the crew
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And I am signed in as a user of "Northwind"
    When I am on the "NW Site" project page
    And I open the "Work" tab
    Then I do not see the "Add to crew" button
