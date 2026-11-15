@zone:dashboard
Feature: Project page tabs
  As someone working on a job
  I want the project page split into tabs that follow the flow, opening on the tab of the current stage
  So that what this stage needs is in front of me (task 122)

  # Tabs: Overview (site, tasks), Sales (work orders and quotes, later), Work (visits, readings, photos and
  # files, crew), Reports (reports), Billing (bills, later). The header, the stage bar and "Next step" show on
  # every tab. Projects written by fixtures start at Inquiry, so they open on Overview.

  @wip @task:122
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

  @wip @task:122
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

  @wip @task:122
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

  @wip @task:122
  Scenario: Sales and Billing say what will come
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I am on the "Panel upgrade" project page
    And I open the "Sales" tab
    Then I see the text "Quotes and work orders will show here."
    When I open the "Billing" tab
    Then I see the text "Bills will show here."

  @wip @task:122
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

  @wip @task:122
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
