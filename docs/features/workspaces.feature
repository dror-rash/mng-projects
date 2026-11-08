@zone:dashboard @task:022
Feature: Workspaces
  As a signed-in user
  I want my work to live in a workspace
  So that I can later share it with my team

  Scenario: A new account gets a personal workspace
    Given I am signed in with an existing account
    When I open "/dashboard"
    Then I see the text "Test User's workspace"

  Scenario: Projects created in my workspace are listed there
    Given I am signed in with an existing account
    And I have a project named "Website Redesign"
    When I open "/dashboard/projects"
    Then I see the text "Test User's workspace"
    And I see the "Website Redesign" link

  @task:029
  Scenario: An admin renames the workspace
    Given I am signed in with an existing account
    When I open "/dashboard/workspace/settings"
    And I fill in "Workspace name" with "Acme Team"
    And I press "Rename workspace"
    And I open "/dashboard"
    Then I see the text "Acme Team"
    When I open "/dashboard/workspaces"
    Then the "Your workspaces" section shows "Acme Team"
    And the "Your workspaces" section does not show "Test User's workspace"

  @task:029
  Scenario: An auditor can't open the workspace settings
    Given I am signed in with an existing account
    And I create an invite link
    And a teammate joins with the invite link
    Then the teammate opening "/dashboard/workspace/settings" sees "Only admins can manage this workspace"

  @task:029
  Scenario: An auditor can't rename the workspace by changing the form
    Given I am signed in with an existing account
    And I create an invite link
    And a teammate joins with the invite link
    When the teammate posts "Rename workspace" for my workspace from their own settings page
    Then the teammate sees the error "Only admins can manage this workspace"

  @task:029
  Scenario: An auditor can't delete the workspace by changing the form
    Given I am signed in with an existing account
    And I create an invite link
    And a teammate joins with the invite link
    When the teammate posts "Delete workspace" for my workspace from their own settings page
    Then the teammate sees the error "Only admins can manage this workspace"
    When I open "/dashboard"
    Then I see the text "Test User's workspace"

  @task:029
  Scenario: Deleting a workspace needs its exact name
    Given I am signed in with an existing account
    And I create a workspace named "Acme Team"
    When I open "/dashboard/workspace/settings"
    And I fill in "Type the name to confirm" with "Acme"
    And I press "Delete workspace"
    Then I see the error "Type the workspace name exactly to delete it"

  @task:029
  Scenario: Deleting a workspace removes its projects for every member
    Given I am signed in with an existing account
    And I create a workspace named "Acme Team"
    And I have a project named "Website Redesign"
    And I keep the link to the "Website Redesign" project
    And I create an invite link
    And a teammate joins with the invite link
    When I delete the workspace "Acme Team"
    Then I see the text "Test User's workspace"
    And I do not see the text "Acme Team"
    And neither the teammate nor I can open the kept project link

  @task:029
  Scenario: Deleting my only workspace gives me a fresh one
    Given I am signed in with an existing account
    And I have a project named "Personal plan"
    When I delete the workspace "Test User's workspace"
    Then I see the text "Test User's workspace"
    When I open "/dashboard/projects"
    Then I do not see the "Personal plan" link

  @task:029
  Scenario: Two workspaces with the same name can be told apart
    Given I am signed in with an existing account
    And I create a workspace named "Acme"
    And I create an invite link
    And a teammate joins with the invite link
    When the teammate creates a workspace named "Acme"
    Then the teammate's workspaces show "Acme" as "Auditor · 2 members" and as "Admin · 1 member"

  @task:029
  Scenario: A workspace name can't be longer than 100 characters
    Given I am signed in with an existing account
    When I open "/dashboard/workspaces"
    Then the "Workspace name" field accepts at most 100 characters
    When I post a workspace name of 101 characters
    Then I see the error "Workspace name must be 100 characters or fewer"

  # Files live in storage, outside the database (ADR-0008): deleting a workspace deletes them too (SEC-08).
  @wip @task:086
  Scenario: Deleting a workspace deletes its photos and files
    Given I am signed in with an existing account
    And I create a workspace named "Acme Team"
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And I am on the "Panel upgrade" project page
    And I add the photo "panel.jpg" with "Add photos"
    And I add the file "wiring-plan.pdf" with "Add files"
    And I copy the download links of the photo "panel.jpg" and the file "wiring-plan.pdf"
    When I delete the workspace "Acme Team"
    Then the copied download links no longer open

  @wip @task:086
  Scenario: Deleting a workspace keeps another workspace's files
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And I am on the "Panel upgrade" project page
    And I add the photo "panel.jpg" with "Add photos"
    And I add the file "wiring-plan.pdf" with "Add files"
    And I copy the download links of the photo "panel.jpg" and the file "wiring-plan.pdf"
    And I create a workspace named "Acme Team"
    When I delete the workspace "Acme Team"
    Then the copied download links still open
