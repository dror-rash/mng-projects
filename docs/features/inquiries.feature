@zone:dashboard
Feature: New inquiries
  As an admin
  I want to record a customer's inquiry, or our outreach, in one quick form
  So that every job starts as a project at stage Inquiry, with its customer, site and first conversation (ADR-0012)

  # Every project has a customer and a site (task 071), so the form creates them when they are new.

  @wip @task:105
  Scenario: An inquiry from a new customer
    Given I am signed in with an existing account
    When I open "/dashboard"
    And I follow the "New inquiry" link
    And I check "New customer"
    And I fill in "Customer name" with "Golan Foods"
    And I fill in "Contact name" with "Rina Cohen"
    And I fill in "Contact phone" with "050-0000000"
    And I fill in "Site name" with "Katzrin plant"
    And I fill in "Project name" with "Cold room wiring"
    And I fill in "What they asked" with "Rewire two cold rooms before the season"
    And I check "They contacted us"
    And I select "Phone" from "Channel"
    And I press "Record inquiry"
    Then I see the heading "Cold room wiring"
    And the project shows "Inquiry" since today
    And I see the text "Inquiry: they contacted us"
    And I see the text "Katzrin plant"
    And the "Communications" section shows "Rewire two cold rooms before the season"
    And the "Communications" section shows "Rina Cohen"
    When I open "/dashboard/customers"
    Then the "Golan Foods" row shows "Lead"

  @wip @task:105
  Scenario: An inquiry from an existing customer at one of its sites
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    When I open "/dashboard/inquiries/new"
    And I check "Existing customer"
    And I select "Acme Ltd" from "Customer"
    And I select "Haifa warehouse" from "Site"
    And I fill in "Project name" with "Forklift chargers"
    And I fill in "What they asked" with "Three new charging points"
    And I check "They contacted us"
    And I select "Email" from "Channel"
    And I press "Record inquiry"
    Then I see the heading "Forklift chargers"
    And I see the text "Haifa warehouse"
    When I open "/dashboard/customers"
    Then the "Acme Ltd" row shows "Active"

  @wip @task:105
  Scenario: Our outreach to a customer
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    When I open "/dashboard/inquiries/new"
    And I check "Existing customer"
    And I select "Acme Ltd" from "Customer"
    And I select "Haifa warehouse" from "Site"
    And I fill in "Project name" with "Annual inspection"
    And I fill in "What they asked" with "Offered this year's inspection"
    And I check "We contacted them"
    And I select "Meeting" from "Channel"
    And I press "Record inquiry"
    Then I see the text "Inquiry: we contacted them"
    And the "Communications" section shows "To the customer"

  @wip @task:105
  Scenario: An inquiry with missing details creates nothing
    Given I am signed in with an existing account
    When I open "/dashboard/inquiries/new"
    And I check "New customer"
    And I fill in "Project name" with "Cold room wiring"
    And I press "Record inquiry"
    Then I see the error "Enter the customer's name"
    When I fill in "Customer name" with "Golan Foods"
    And I press "Record inquiry"
    Then I see the error "Enter a site name"
    When I fill in "Site name" with "Katzrin plant"
    And I press "Record inquiry"
    Then I see the error "Choose who reached out"
    When I open "/dashboard/customers"
    Then I do not see the text "Golan Foods"

  @wip @task:105
  Scenario: Only admins record inquiries
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And I am signed in as a user of "Northwind"
    When I open "/dashboard"
    Then I do not see the "New inquiry" link
    When I open "/dashboard/inquiries/new"
    Then I see the heading "This page could not be found."
    And the auditor opens "/dashboard"
    Then the auditor sees no "New inquiry" link
