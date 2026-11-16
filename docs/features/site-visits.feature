@zone:dashboard @task:058
Feature: Site visits
  As someone who works at a project's site
  I want to record each visit: when it was, who was there and what we found
  So that the project keeps a log of the work on site (ADR-0008)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"

  Scenario: I record a visit with the people who were there and notes
    When I am on the "Panel upgrade" project page
    And I open the "Work" tab
    And I follow the "Record a visit" link
    Then the "Visited on" field shows today's date
    And the "Test User" box is checked
    When I fill in "Notes" with "Main panel replaced; breaker 4 still trips"
    And I press "Save visit"
    Then I see the heading of today's visit
    And I see the text "Haifa warehouse"
    And I see the text "Test User"
    And I see the text "Main panel replaced; breaker 4 still trips"
    When I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the "Visits" section shows "Main panel replaced; breaker 4 still trips"

  Scenario: A visit needs a date, not in the future, and someone who was there
    When I open the new visit page of "Panel upgrade"
    And I fill in "Visited on" with a date 3 days from now
    And I press "Save visit"
    Then I see the error "A visit can't be in the future"
    When I fill in "Visited on" with a date 2 days ago
    And I uncheck "Test User"
    And I press "Save visit"
    Then I see the error "Choose who was there"

  Scenario: Visits are listed newest first
    Given "Panel upgrade" has a visit 5 days ago with the notes "First look"
    And "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    When I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the visits listed are "Panel delivered, First look"

  Scenario: Sending the same visit twice records it once
    When I open the new visit page of "Panel upgrade"
    And I fill in "Notes" with "Sent twice"
    And I press "Save visit"
    And I send the same visit form again
    And I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the visits listed are "Sent twice"

  Scenario: I edit and delete my visit, and an admin restores it
    Given "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I follow the "Edit visit" link
    And I fill in "Notes" with "Panel delivered and checked"
    And I press "Save visit"
    Then I see the text "Panel delivered and checked"
    When I press "Delete visit"
    Then the visits listed are ""
    When I open "/dashboard/deleted"
    And I press "Restore Panel delivered and checked"
    And I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the visits listed are "Panel delivered and checked"

  # Roles and isolation: the leak suite's workspace (partner-access.feature, workers.feature).
  Scenario: A crew worker records visits; the auditor reads them
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the new visit page of the project "NW Site"
    Then the "Who was there" boxes are "Admin, Worker"
    When I fill in "Notes" with "Cables pulled"
    And I press "Save visit"
    Then I see the text "Cables pulled"
    When the auditor opens the "NW Site" project page
    Then the auditor sees the text "Cables pulled"
    And the auditor sees no "Record a visit" link

  Scenario: Only the visit's author and admins change it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin recorded a visit to "NW Site" with the notes "Admin's look"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the visit "Admin's look" of the project "NW Site"
    Then I do not see the "Edit visit" link
    And I do not see the "Delete visit" button
    When I post the delete form of the visit "Admin's look"
    Then the admin sees the visit "Admin's look" on "NW Site"

  Scenario: Another partner's visits stay hidden, and so do a worker's non-crew projects'
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin recorded a visit to "GX App" with the notes "Globex secret"
    And I am signed in as a user of "Northwind"
    When I open the address of the visit "Globex secret"
    Then I see "Visit not found", the same as for a made-up visit address
    And the page shows none of "Globex secret"

  Scenario: My visit forms are refused for another partner's project and for people not on the project
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And I am signed in as a user of "Northwind"
    When I record a visit on "NW Site" with the project id of "GX App"
    Then I see "Something went wrong", the same as with a made-up id
    When I record a visit on "NW Site" with the person id of "Globex User"
    Then I see "Choose who was there from the list", the same as with a made-up id
    And the admin sees no visits on "GX App"

  Scenario: A visit form that reuses another partner's visit id is refused
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin recorded a visit to "GX App" with the notes "Globex secret"
    And I am signed in as a user of "Northwind"
    When I record a visit on "NW Site" with the visit id of "Globex secret"
    Then I see the text "Something went wrong"
    And the admin sees no visits on "NW Site"
    And the admin sees the visit "Globex secret" on "GX App"
