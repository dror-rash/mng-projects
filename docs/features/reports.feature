@zone:dashboard
Feature: Uploaded reports
  As someone responsible for a project
  I want to upload the project's reports and find them on the project
  So that the finished report stays with the work it describes (ADR-0008)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"

  @task:064
  Scenario: I upload a report and download it from the project
    When I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    And I add the file "inspection-report.pdf" with "Upload a report"
    Then the reports listed are "inspection-report.pdf"
    And the "Reports" section shows "Test User"
    And I open the "Work" tab
    And the "Photos and files" section does not show "inspection-report.pdf"
    And I open the "Reports" tab
    And the report "inspection-report.pdf" downloads as "inspection-report.pdf"

  @task:064
  Scenario: A report must be a document, up to 50 MB
    When I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    And I add the file "walkthrough.mp4" with "Upload a report"
    Then I see the error "Reports must be PDF, Word, Excel, CSV, text or images"
    When I add a 60 MB file "huge-report.pdf" with "Upload a report"
    Then I see the error "Reports can be up to 50 MB"
    And the "Reports" section shows "No reports yet."

  @task:064
  Scenario: I delete my report, and an admin restores it
    When I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    And I add the file "inspection-report.pdf" with "Upload a report"
    And I press "Delete inspection-report.pdf"
    Then the "Reports" section shows "No reports yet."
    When I open "/dashboard/deleted"
    Then I see the text "Report"
    When I press "Restore inspection-report.pdf"
    And I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    Then the reports listed are "inspection-report.pdf"

  # Roles and isolation: the leak suite's workspace (partner-access.feature, workers.feature).
  @task:064
  Scenario: A crew worker uploads a report; the auditor and the partner see it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin uploaded the report "admin-report.pdf" to "NW Site"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    And I open the "Reports" tab
    And I add the file "crew-report.pdf" with "Upload a report"
    Then the reports listed are "crew-report.pdf, admin-report.pdf"
    And I see the "Delete crew-report.pdf" button
    And I do not see the "Delete admin-report.pdf" button
    When the auditor opens the "Reports" tab of the "NW Site" project
    Then the auditor sees the text "crew-report.pdf"
    And the auditor sees no "Upload a report" button and no "Delete crew-report.pdf" button
    When the "Northwind" user opens the "Reports" tab of the "NW Site" project
    Then the "Northwind" user sees the text "crew-report.pdf"

  @task:064
  Scenario: Another partner's report stays hidden, its address included
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin uploaded the report "globex-report.pdf" to "GX App"
    And I am signed in as a user of "Northwind"
    When I open the address of the report "globex-report.pdf"
    Then it is not found, the same as a made-up photo address

  @task:064
  Scenario: A worker doesn't see the report of a project they're not on
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin uploaded the report "globex-report.pdf" to "GX App"
    And I am signed in as a worker
    When I open the address of the report "globex-report.pdf"
    Then it is not found, the same as a made-up photo address

  @task:064
  Scenario: My report uploads are refused for another partner's project
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And I am signed in as a user of "Northwind"
    When I start a report upload on "NW Site" with the project id of "GX App"
    Then the upload is refused, the same as with a made-up id
    And the admin sees no reports on "GX App"

  # Leak suite from the access audit: writes posted directly, bypassing the page.
  @task:064
  Scenario: A crew worker can't delete the admin's report by posting its id
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin uploaded the report "admin-report.pdf" to "NW Site"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I post the delete form of the report "admin-report.pdf"
    Then the delete is refused, the same as with a made-up id
    And the admin sees the reports "admin-report.pdf" on "NW Site"

  @task:064
  Scenario: A partner can't delete another partner's report through their own project
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin uploaded the report "globex-report.pdf" to "GX App"
    And I am signed in as a user of "Northwind"
    When I post the delete form of the report "globex-report.pdf" on "NW Site"
    Then the delete is refused, the same as with a made-up id
    And the admin sees the reports "globex-report.pdf" on "GX App"

  @task:064
  Scenario: The auditor can't upload a report by starting the upload directly
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    When the auditor starts a report upload on "NW Site"
    Then the auditor's upload is refused, the same as with a made-up id
    And the admin sees no reports on "NW Site"

  @task:064
  Scenario: A report can't be put on a visit
    Given "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    When I start a report upload on the visit "Panel delivered" of "Panel upgrade"
    Then the upload is refused, the same as with a made-up id
    When I am on the "Panel upgrade" project page
    And I open the "Reports" tab
    Then the "Reports" section shows "No reports yet."

  @task:064
  Scenario: A worker taken off the crew loses the report's address
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin uploaded the report "nw-report.pdf" to "NW Site"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    And I open the "Reports" tab
    Then the reports listed are "nw-report.pdf"
    When the admin opens the "Work" tab of the "NW Site" project
    And the admin removes "Worker" from the crew
    And I open the address of the report "nw-report.pdf"
    Then it is not found, the same as a made-up photo address

  @task:064
  Scenario: A deleted report's address is not found for a partner, and they can't restore it
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin uploaded the report "nw-report.pdf" to "NW Site"
    And the report "nw-report.pdf" is deleted
    And I am signed in as a user of "Northwind"
    When I open the address of the report "nw-report.pdf"
    Then it is not found, the same as a made-up photo address
    When I post the restore form of the report "nw-report.pdf"
    Then the restore is refused, the same as with a made-up id
    And the admin sees no reports on "NW Site"
