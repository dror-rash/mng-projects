@zone:dashboard @task:059
Feature: Photos and files
  As someone who works at a project's site
  I want to add photos and files to the project or to a visit
  So that what we saw and the documents we got stay with the work (ADR-0008)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"

  Scenario: I add a photo to a project and open it from the gallery
    When I am on the "Panel upgrade" project page
    And I add the photo "panel.jpg" with "Add photos"
    Then the "Photos and files" section shows the photo "panel.jpg"
    And the photo "panel.jpg" opens as an image

  Scenario: I add a file and download it under its name
    When I am on the "Panel upgrade" project page
    And I add the file "wiring-plan.pdf" with "Add files"
    Then the "Photos and files" section shows the file "wiring-plan.pdf"
    And the file "wiring-plan.pdf" downloads as "wiring-plan.pdf"

  Scenario: A photo must be an image, and files have a size limit
    When I am on the "Panel upgrade" project page
    And I add the file "notes.txt" with "Add photos"
    Then I see the error "Photos must be JPEG, PNG, WebP or HEIC images"
    When I add a 60 MB file "huge.pdf" with "Add files"
    Then I see the error "Files can be up to 50 MB"
    And the "Photos and files" section shows "No photos or files yet."

  Scenario: Photos of a visit show on the visit and in the project's gallery
    Given "Panel upgrade" has a visit 2 days ago with the notes "Panel delivered"
    When I open the visit "Panel delivered" of "Panel upgrade"
    And I add the photo "delivery.jpg" with "Add photos"
    Then the "Photos and files" section shows the photo "delivery.jpg"
    When I am on the "Panel upgrade" project page
    Then the "Photos and files" section shows the photo "delivery.jpg"
    And the "Photos and files" section shows "Panel delivered"

  Scenario: I delete my photo, and an admin restores it
    When I am on the "Panel upgrade" project page
    And I add the photo "panel.jpg" with "Add photos"
    And I press "Delete panel.jpg"
    Then the "Photos and files" section shows "No photos or files yet."
    When I open "/dashboard/deleted"
    And I press "Restore panel.jpg"
    And I am on the "Panel upgrade" project page
    Then the "Photos and files" section shows the photo "panel.jpg"

  # Roles and isolation: the leak suite's workspace (partner-access.feature, workers.feature).
  Scenario: A crew worker adds photos; the auditor sees them; only the uploader and admins delete
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin added the photo "admin.jpg" to "NW Site"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    And I add the photo "cables.jpg" with "Add photos"
    Then the "Photos and files" section shows the photo "cables.jpg"
    And I see the "Delete cables.jpg" button
    And I do not see the "Delete admin.jpg" button
    When the auditor opens the "NW Site" project page
    Then the auditor sees the text "cables.jpg"
    And the auditor sees no "Add photos" button and no "Delete cables.jpg" button

  Scenario: Another partner's photo stays hidden, its address included
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin added the photo "globex-secret.jpg" to "GX App"
    And I am signed in as a user of "Northwind"
    When I open the address of the photo "globex-secret.jpg"
    Then it is not found, the same as a made-up photo address

  Scenario: My upload forms are refused for another partner's project and for another upload
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the admin added the photo "globex-secret.jpg" to "GX App"
    And I am signed in as a user of "Northwind"
    When I start an upload on "NW Site" with the project id of "GX App"
    Then the upload is refused, the same as with a made-up id
    When I finish an upload on "NW Site" with the upload id of "globex-secret.jpg"
    Then the upload is refused, the same as with a made-up id
    And the admin sees only "globex-secret.jpg" on "GX App"

  Scenario: Photos of a deleted visit are hidden like the visit
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the admin recorded a visit to "NW Site" with the notes "Panel delivered"
    And the admin added the photo "visit.jpg" to the visit "Panel delivered"
    And the visit "Panel delivered" is deleted
    And I am signed in as a user of "Northwind"
    When I open the address of the photo "visit.jpg"
    Then it is not found, the same as a made-up photo address

  # An upload left unfinished (a dropped connection) is cleared after an hour; until then it counts (SEC-07).
  @wip @task:087
  Scenario: Too many unfinished uploads are refused
    Given I am on the "Panel upgrade" project page
    And my connection drops during 10 photo uploads
    When I add the photo "panel.jpg" with "Add photos"
    Then I see the error "Too many uploads in progress. Try again later."
    And the "Photos and files" section shows "No photos or files yet."
