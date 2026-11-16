@zone:dashboard
Feature: Readings
  As someone who works at a project's site
  I want to fill in the published reading forms on a visit
  So that what we measured is recorded the same way every time, with the visit it came from (ADR-0008)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    # Reading forms are built and published through task 060's pages, as an admin of my workspace.
    And I have a published reading form "Panel check" with the fields:
      | label           | type   | unit | required | options             |
      | Voltage         | Number | V    | yes      |                     |
      | Breaker trips   | Yes/no |      | no       |                     |
      | Cable condition | Choice |      | no       | Good, Worn, Damaged |
      | Remarks         | Text   |      | no       |                     |

  @task:061
  Scenario: I fill in a reading on a visit
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I follow the "Add a reading" link
    And I follow the "Panel check" link
    And I fill in "Voltage" with "230"
    And I choose "Yes" for "Breaker trips"
    And I select "Worn" from "Cable condition"
    And I press "Save reading"
    Then I see the heading "Panel check"
    And I see the text "230 V"
    And I see the text "Worn"
    And I see the text "Not filled in"
    And I see the text "Test User"
    When I open the visit "Panel delivered" of "Panel upgrade"
    Then the "Readings" section shows "Panel check"
    When I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the readings listed are "Panel check"

  @task:061
  Scenario: A reading's values are checked against its form
    When I open the "Panel check" reading form on the visit "Panel delivered"
    And I select "Worn" from "Cable condition"
    And I press "Save reading"
    Then I see the error "Voltage is required"
    And "Worn" is selected in "Cable condition"
    When I fill in "Voltage" with "230"
    And I press "Save reading"
    Then I see the text "230 V"

  @task:061
  Scenario: Only published forms are offered, and readings outlive their form
    Given I have a draft reading form "Draft check" with the field "Current"
    And I have a published reading form "Old check" with the field "Pressure"
    And I filled in the reading "Old check" on the visit "Panel delivered" with "Pressure" as "4.5"
    And the form "Old check" is archived
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I follow the "Add a reading" link
    Then the forms offered are "Panel check"
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I follow the "Old check" link in the "Readings" section
    Then I see the heading "Old check"
    And I see the text "Pressure"
    And I see the text "4.5"

  @task:061
  Scenario: Sending the same reading twice records it once
    When I open the "Panel check" reading form on the visit "Panel delivered"
    And I fill in "Voltage" with "230"
    And I press "Save reading"
    And I send the same reading form again
    And I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then the readings listed are "Panel check"

  # Roles and isolation: the leak suite's workspace (partner-access.feature, workers.feature).
  @task:061
  Scenario: A crew worker fills a reading; the auditor reads it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin recorded a visit to "NW Site" with the notes "Cables pulled"
    And the admin published the reading form "Site check" with the field "Voltage"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the visit "Cables pulled" of the project "NW Site"
    And I follow the "Add a reading" link
    And I follow the "Site check" link
    And I fill in "Voltage" with "231"
    And I press "Save reading"
    Then I see the heading "Site check"
    And I see the text "Worker"
    When the auditor opens the "Work" tab of the "NW Site" project
    Then the auditor sees the text "Site check"
    When the auditor opens the visit "Cables pulled" of the project "NW Site"
    Then the auditor sees the text "Site check"
    And the auditor sees no "Add a reading" link

  @task:061
  Scenario: Another partner's readings stay hidden, and so do a deleted visit's
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin recorded a visit to "GX App" with the notes "Globex visit"
    And the admin filled in the reading "Site check" on the visit "Globex visit"
    And the admin recorded a visit to "NW Site" with the notes "Northwind visit"
    And the admin filled in the reading "Site check" on the visit "Northwind visit"
    And the visit "Northwind visit" is deleted
    And I am signed in as a user of "Northwind"
    When I open the address of the reading on the visit "Globex visit"
    Then I see "Reading not found", the same as with a made-up id
    When I open the address of the reading on the visit "Northwind visit"
    Then I see "Reading not found", the same as with a made-up id

  @task:061
  Scenario: My reading forms are refused for another partner's visit and for a draft form
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin has a draft reading form "Draft check" with the field "Current"
    And the admin recorded a visit to "GX App" with the notes "Globex visit"
    And the admin recorded a visit to "NW Site" with the notes "Northwind visit"
    And I am signed in as a user of "Northwind"
    When I add the reading "Site check" on the visit "Northwind visit" with the visit id of "Globex visit"
    Then I see "Something went wrong", the same as with a made-up id
    When I add the reading "Site check" on the visit "Northwind visit" with the form "Draft check"
    Then I see "Choose a form from the list", the same as with a made-up id
    And the admin sees no readings on "GX App"
    And the admin sees no readings on "NW Site"

  # From the access audit: the rest of the leak suite (reused ids, workers off the crew, auditors posting,
  # other workspaces' forms, the Add-a-reading page).
  @task:061
  Scenario: Another workspace's published form is refused like a made-up one
    Given another user has a published reading form "Their check" with the field "Current"
    When I add the reading "Panel check" on the visit "Panel delivered" with the form "Their check"
    Then I see "Choose a form from the list", the same as with a made-up id
    When I open the Add a reading page of the visit "Panel delivered" with the form "Their check"
    Then the forms offered are "Panel check"
    When I am on the "Panel upgrade" project page
    And I open the "Work" tab
    Then I see the text "No readings yet."

  @task:061
  Scenario: A reading form that reuses another partner's reading id is refused
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin recorded a visit to "GX App" with the notes "Globex visit"
    And the admin filled in the reading "Site check" on the visit "Globex visit"
    And the admin recorded a visit to "NW Site" with the notes "Northwind visit"
    And I am signed in as a user of "Northwind"
    When I add the reading "Site check" on the visit "Northwind visit" with the id of the reading on the visit "Globex visit"
    Then I see the text "Something went wrong"
    And the admin sees no readings on "NW Site"

  @task:061
  Scenario: Another partner's visit has no Add a reading page
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin recorded a visit to "GX App" with the notes "Globex visit"
    And I am signed in as a user of "Northwind"
    When I open the Add a reading page of the visit "Globex visit"
    Then I see "Visit not found", the same as for a made-up visit address
    And the page shows none of "Site check"

  @task:061
  Scenario: A worker taken off the crew loses the visit's readings
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin recorded a visit to "NW Site" with the notes "Cables pulled"
    And the admin filled in the reading "Site check" on the visit "Cables pulled"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the "Site check" reading form on the visit "Cables pulled"
    And the admin opens the "Work" tab of the "NW Site" project
    And the admin removes "Worker" from the crew
    And I fill in "Voltage" with "231"
    And I press "Save reading"
    Then I see the text "Something went wrong"
    When I open the address of the reading on the visit "Cables pulled"
    Then I see "Reading not found", the same as with a made-up id

  @task:061
  Scenario: The auditor can't add a reading by posting the form directly
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin published the reading form "Site check" with the field "Voltage"
    And the admin recorded a visit to "NW Site" with the notes "Cables pulled"
    When the auditor posts the "Site check" reading form on the visit "Cables pulled"
    Then the auditor sees the text "Something went wrong"
    And the admin sees no readings on "NW Site"
