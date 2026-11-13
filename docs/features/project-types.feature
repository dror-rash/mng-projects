@zone:dashboard
Feature: Project types
  As an admin
  I want to mark a project as work, an expert opinion or an arbitration
  So that I can tell those jobs apart while they go through the same stages (ADR-0012)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"

  @wip @task:102
  Scenario: A project is an expert opinion
    When I open "/dashboard/projects/new"
    Then the "Type" select offers "Work, Expert opinion, Arbitration" with "Work" chosen
    When I fill in "Project name" with "Fire damage opinion"
    And I select "Acme Ltd" from "Customer"
    And I select "Haifa warehouse" from "Site"
    And I select "Expert opinion" from "Type"
    And I press "Create Project"
    Then I see the heading "Fire damage opinion"
    And I see the text "Expert opinion"

  @wip @task:102
  Scenario: The projects table filters by type
    Given I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And I have a project named "Insurance dispute" at the site "Haifa warehouse"
    When I am on the edit page of the "Insurance dispute" project
    And I select "Arbitration" from "Type"
    And I press "Save changes"
    And I open "/dashboard/projects"
    Then the "Insurance dispute" row shows "Arbitration"
    And the "Panel upgrade" row shows "Work"
    When I select "Arbitration" from "Type"
    Then the projects shown are "Insurance dispute"

  @wip @task:102
  Scenario: A made-up type is refused
    Given I have a project named "Panel upgrade" at the site "Haifa warehouse"
    When I am on the edit page of the "Panel upgrade" project
    And I choose "Made up" in "Type" by editing the page
    And I press "Save changes"
    Then I see the error "Choose a type"
