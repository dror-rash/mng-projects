@zone:dashboard
Feature: The POC flow, from a customer to a report
  As the owner showing the POC
  I want one story to work from start to finish, locally and on the deployed app
  So that a viewer can follow the work from a customer and its site to the report, with each person seeing their part (ADR-0008)

  # One scenario on purpose: each part needs what the part before it made, and every person in it is a new
  # account. Split into several scenarios, each would sign up its people again and repeat the setup through
  # the pages, which the preview's sign-up limit can't afford. The piece-by-piece scenarios live in the
  # features of tasks 053–061 and 064; this one checks that the pieces work together.
  #
  # It runs locally (CI's e2e job) and against the deployed preview (BASE_URL, task 068), so every step goes
  # through the app only: no database or storage access from the test runner. Against a deployment, sign-ups
  # and sign-ins are spaced at least 10 seconds apart: Better Auth allows 3 per 10 seconds per IP, and
  # deployments never turn the limit off (rule 13).
  #
  # People: "I" am the admin (my own new workspace); the worker and the partner user join with invite links.
  @poc @task:069 @timeout:240000
  Scenario: An admin sets up the work, a worker does it on site, the admin adds the report, and a partner sees only their own
    # The admin: a customer with a sub-company, a site with the person to meet there, a project with two tasks
    Given I am signed in with an existing account
    When I open "/dashboard/customers"
    And I follow the "New customer" link
    And I fill in "Name" with "Acme Ltd"
    And I press "Save customer"
    Then I see the heading "Acme Ltd"
    When I follow the "New sub-company" link
    And I fill in "Name" with "Acme Retail"
    And I press "Save customer"
    Then I see the heading "Acme Retail"
    When I follow the "New site" link
    And I fill in "Site name" with "Dizengoff store"
    And I fill in "Address" with "50 Dizengoff St, Tel Aviv"
    And I press "Save site"
    Then I see the heading "Dizengoff store"
    When I fill in "Contact name" with "Yossi Mizrahi"
    And I fill in "Role" with "Store manager"
    And I press "Add contact"
    Then the "On-site contacts" section shows "Yossi Mizrahi"
    When I follow the "New project" link
    And I fill in "Project name" with "Store wiring"
    And I press "Create Project"
    Then I see the heading "Store wiring"
    And I see the text "Acme Ltd › Acme Retail"
    And the "Site" section shows "Dizengoff store"
    And the "Site" section shows "Yossi Mizrahi"
    When the project has a task "Pull cables"
    And the project has a task "Fit the panel"
    # The admin: a published reading form, and a worker on the project's crew
    And I have a published reading form "Panel check" with the fields:
      | label           | type   | unit | required | options             |
      | Voltage         | Number | V    | yes      |                     |
      | Cable condition | Choice |      | no       | Good, Worn, Damaged |
    And I create an invite link for the role "Worker"
    And the worker "Dana Levi" joins with the invite link
    And I am on the "Store wiring" project page
    And I select "Dana Levi" from "Worker to add"
    And I press "Add to crew"
    Then the "Crew" section shows "Dana Levi"
    # The worker, on site
    When the worker opens the "Store wiring" project
    Then the worker sees the text "Dizengoff store"
    And the worker sees the text "Yossi Mizrahi"
    When the worker records a visit with the notes "Main panel checked; breaker 4 trips"
    And the worker adds the photo "panel.jpg" to the visit
    And the worker fills in the "Panel check" reading on the visit with "Voltage" as "230"
    And the worker moves the task "Pull cables" to "Done"
    # The admin again: the report, and everything the worker recorded, on the project
    When I am on the "Store wiring" project page
    And I add the file "inspection-report.pdf" with "Upload a report"
    Then the reports listed are "inspection-report.pdf"
    And the report "inspection-report.pdf" downloads as "inspection-report.pdf"
    And the visits listed are "Main panel checked; breaker 4 trips"
    And the "Photos and files" section shows the photo "panel.jpg"
    And the photo "panel.jpg" opens as an image
    And the readings listed are "Panel check"
    And the task "Pull cables" is in the "Done" column
    And the task "Fit the panel" is in the "To do" column
    When I follow the "Panel check" link in the "Readings" section
    Then I see the text "230 V"
    And I see the text "Dana Levi"
    # A partner, at the same site: a short check that they see their own project and its site, and nothing
    # of ours (the leak suite, partner-access.feature, checks the details)
    Given I have a partner "Northwind" with the customer "Acme Ltd › Acme Retail"
    When I am on the "Store wiring" project page
    And I follow the "Dizengoff store" link in the "Site" section
    And I follow the "New project" link
    And I fill in "Project name" with "Shelf lighting"
    And I select "Northwind" from "Owner"
    And I press "Create Project"
    Then I see the heading "Shelf lighting"
    When I create an invite link for the role "Partner: Northwind"
    And the partner user "Omer Katz" joins with the invite link
    Then the partner user's projects are "Shelf lighting"
    When the partner user opens the "Shelf lighting" project
    And the partner user follows the "Dizengoff store" link
    Then the partner user sees the heading "Dizengoff store"
    And the partner user sees the text "Yossi Mizrahi"
    And the partner user's page shows none of "Store wiring, Pull cables, Main panel checked"
    And the partner user can't open the "Store wiring" project
