@zone:dashboard @task:056
Feature: Workers: internal technicians on a project's crew
  As an admin
  I want to give our technicians a Worker role and put them on the crews of the projects they work on
  So that they see just those projects, their sites and tasks, and get the work done (ADR-0008)

  # The leak suite's workspace (partner-access.feature), written straight to the database. "I" am a worker
  # of it; the admin signs in when a step needs them.
  Background:
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And the internal project "HQ Plan" has the task "Budget"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And "Globex" has the project "GX App" for "Acme Ltd" with the task "Login"
    And the customer "Acme Ltd" has the site "Acme HQ" with the contact "Yossi Mizrahi"
    And the project "NW Site" is at the site "Acme HQ"
    And I am signed in as a worker
    And I am on the crew of "NW Site"

  Scenario: I see only my crew's projects
    When I open "/dashboard/projects"
    Then the projects shown are "NW Site"
    And the page shows none of "GX App, Login, HQ Plan, Budget"
    When I open "/dashboard"
    Then the recently started projects are "NW Site"

  Scenario: A project I'm not on the crew of is not found
    When I open the address of the "GX App" project
    Then I see "Project not found", the same as for a made-up project address
    When I open the address of the "Budget" task
    Then I see "Task not found", the same as for a made-up task address

  Scenario: I work on my crew's tasks, not on the project itself
    When I am on the "NW Site" project page
    Then I do not see the "Edit project" link
    And I do not see the "Copy to new project" link
    And I do not see the "Cancel project" button
    And I do not see the "Delete project" link
    When I fill in "Task title" with "Pull cables"
    And I press "Add task"
    And I move the task "Copy" to "In progress"
    Then the task "Pull cables" is in the "To do" column
    And the task "Copy" is in the "In progress" column
    When I am on the "Copy" task page
    And I fill in "Description" with "Bring the long ladder"
    And I press "Save changes"
    Then I see the text "Bring the long ladder"
    And I do not see the "Delete task" button

  Scenario: No customer, partner or Deleted pages for me
    When I open "/dashboard/partners"
    Then I see the heading "This page could not be found."
    When I open "/dashboard/deleted"
    Then I see the heading "This page could not be found."

  Scenario: I can't create projects
    When I open "/dashboard/projects"
    Then I do not see the "New project" link
    When I open "/dashboard/projects/new"
    Then I see the heading "This page could not be found."

  Scenario: I see customer names but no customer pages
    When I am on the "NW Site" project page
    Then I see the text "Acme Ltd"
    And I do not see the "Acme Ltd" link
    When I open "/dashboard/customers"
    Then I see the heading "This page could not be found."

  Scenario: I see my project's site, with the people to meet there
    When I am on the "NW Site" project page
    Then the "Site" section shows "Acme HQ"
    And the "Site" section shows "Yossi Mizrahi"
    When I follow the "Acme HQ" link
    Then I see the heading "Acme HQ"
    And I do not see the "Edit site" link

  Scenario: The site of a project I'm not on the crew of stays hidden
    Given the customer "Acme Ltd" has the site "Acme Plant" with the contact "Dana Levi"
    And the project "GX App" is at the site "Acme Plant"
    When I open the address of the site "Acme Plant"
    Then I see "Site not found", the same as for a made-up site address
    And the page shows none of "Dana Levi"

  Scenario: My crew's tasks can be assigned to me
    Then the admin's "Assignee" options for the task "Copy" are "Unassigned, Admin, Worker"
    And the admin's "Assignee" options for the task "Budget" are "Unassigned, Admin"
    When the task "Copy" is assigned to me by the admin
    And I open "/dashboard/my-tasks"
    Then the "My tasks" section shows "Copy"

  Scenario: An admin puts a worker on a project's crew
    When the admin opens the "Work" tab of the "GX App" project
    And the admin adds "Worker" to the crew
    Then the admin sees the "Crew" section shows "Worker"
    When I open "/dashboard/projects"
    Then the projects shown are "GX App, NW Site"

  Scenario: Leaving a crew hides the project and clears my tasks there
    Given the task "Copy" is assigned to me by the admin
    When the admin opens the "Work" tab of the "NW Site" project
    And the admin removes "Worker" from the crew
    And I open "/dashboard/projects"
    Then the page shows none of "NW Site"
    When the admin opens the task "Copy" of "NW Site"
    Then the admin sees the text "Unassigned"

  Scenario: Only admins see and change the crew
    When I am on the "NW Site" project page
    And I open the "Work" tab
    Then I do not see the "Add to crew" button
    And I do not see the "Remove Worker" button
    When the auditor opens the "Work" tab of the "NW Site" project
    Then the auditor sees the text "Worker"
    And the auditor sees no "Add to crew" button and no "Remove Worker" button

  Scenario: Admins invite workers
    When the admin opens "/dashboard/workspace"
    Then the admin's "Role" select offers "Admin, Auditor, Worker, Partner: Globex, Partner: Northwind" with "Auditor" chosen

  Scenario: My forms are refused for projects I'm not on the crew of, and for what workers can't do
    When I add the task "Sneaky" on "NW Site" with the project id of "GX App"
    Then I see "Something went wrong", the same as with a made-up id
    When I post the delete form of the task "Copy"
    Then the admin sees the tasks of "NW Site" are "Copy"
    When I post the edit form of the "NW Site" project with the name "Renamed"
    Then the admin sees the "NW Site" project

  @task:072
  Scenario: A site page lists only my crew's projects at it
    Given the project "GX App" is at the site "Acme HQ"
    When I am on the "NW Site" project page
    And I follow the "Acme HQ" link
    Then the "Projects" section shows "NW Site"
    And the page shows none of "GX App, Login, HQ Plan, Budget"
    And I do not see the "New project" link
