@zone:shell
Feature: The dashboard is home, with a short menu
  As someone using the app
  I want to land on the dashboard and see only the main pages in the menu
  So that the flow from customers to sites to projects is simple to follow

  @task:070
  @smoke
  Scenario: Opening the home address signed out shows the login page, and logging in lands on the overview
    Given an existing account
    And I am on the home page
    Then I am sent to the login page
    And I see the heading "Welcome back"
    When I log in with my email and password
    Then the URL path is "/dashboard"
    And I see the heading "Overview"

  @task:070
  Scenario: Opening the home address signed in shows the overview
    Given I am signed in with an existing account
    And I am on the home page
    Then the URL path is "/dashboard"
    And I see the heading "Overview"
    And I see my email address

  @task:070 @zone:dashboard
  Scenario: The menu is Overview, All projects and Customers
    Given I am signed in with an existing account
    When I open "/dashboard"
    Then the dashboard menu links are "Overview, All projects, Customers"
    And I do not see the "Home" link
    And I do not see the "Example zone" link

  @task:070 @zone:dashboard
  Scenario: Pages left out of the menu still open by their address
    Given I am signed in with an existing account
    When I open "/dashboard/partners"
    Then I see the heading "Partners"
    When I open "/dashboard/my-tasks"
    Then I see the heading "My tasks"
    When I open "/dashboard/deleted"
    Then I see the heading "Deleted items"

  # Task 119: the side menu. Below 1024px it folds into a drawer that opens from a menu button.

  @task:119 @zone:dashboard
  Scenario: The menu marks the page I am on
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    When I open "/dashboard"
    Then the menu marks "Overview" as the current page
    When I open "/dashboard/projects"
    Then the menu marks "All projects" as the current page
    When I am on the "Panel upgrade" project page
    Then the menu marks "All projects" as the current page
    When I open "/dashboard/customers"
    Then the menu marks "Customers" as the current page
    When I open "/dashboard/my-tasks"
    Then no menu item is marked as the current page

  @task:119 @zone:dashboard
  Scenario: The menu shows my workspace, my role and my account
    Given I am signed in with an existing account
    When I open "/dashboard"
    Then the header shows the workspace "Test User's workspace"
    And the header says "Admin"
    And I see my email address
    And I see the "Log out" button

  @task:119 @zone:dashboard
  Scenario: On a phone the menu opens from a button and closes with Escape
    Given I am signed in with an existing account
    And my screen is 360 pixels wide
    When I open "/dashboard"
    Then the dashboard menu is closed
    When I open the menu
    Then the dashboard menu links are "Overview, All projects, Customers"
    And I see my email address
    When I close the menu with the Escape key
    Then the dashboard menu is closed

  @task:119 @zone:dashboard
  Scenario: On a phone, choosing a page in the menu opens it and closes the menu
    Given I am signed in with an existing account
    And my screen is 360 pixels wide
    When I open "/dashboard"
    And I open the menu
    And I follow the "All projects" link
    Then I see the heading "All projects"
    And the dashboard menu is closed

  @task:119 @zone:dashboard
  Scenario: On a phone I log out from the menu
    Given I am signed in with an existing account
    And my screen is 360 pixels wide
    When I open "/dashboard"
    And I open the menu
    And I log out
    Then I am sent to the login page

  @task:119 @zone:dashboard
  Scenario: In Hebrew the menu is on the right
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    When I open "/dashboard"
    Then the page is right to left
    And the menu is on the right

  # Task 119, leak suite: the menu never offers what my role can't open, and never shows my role from one
  # workspace on a page of another. The workspace is the leak suite's (partner-access.feature, workers.feature).

  @task:119 @zone:dashboard
  Scenario: A worker's menu has no Customers
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And I am signed in as a worker
    And my screen is 1280 pixels wide
    When I open "/dashboard"
    Then the dashboard menu links are "Overview, All projects"
    And the header has no "Customers" link

  @task:119 @zone:dashboard
  Scenario: A partner's menu on a phone has no Customers
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And I am signed in as a user of "Northwind"
    And my screen is 360 pixels wide
    When I open "/dashboard"
    And I open the menu
    Then the dashboard menu links are "Overview, All projects"
    And the header has no "Customers" link

  @task:119 @zone:dashboard
  Scenario: On a page from another workspace the menu doesn't show my role from the current one
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And I am signed in as a user of "Northwind"
    And I am also an admin of my own workspace, with the task "Mine" assigned to me
    When I switch to "My own"
    Then the header shows the workspace "My own"
    And the header says "Admin"
    When I open the address of the "NW Site" project
    Then I see the heading "NW Site"
    And the header shows the workspace "Partner Hub"
    And the header says "in another workspace"
    And the header does not say "Admin"
