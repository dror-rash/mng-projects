@zone:dashboard
Feature: Customer communications and follow-ups
  As an admin
  I want to log the calls, emails, WhatsApp messages and meetings we have with a customer, with a follow-up date
  So that anyone in the office knows what was said and what we promised to do next

  # Communications are commercial records (ADR-0012): admins write them, auditors read them, workers and
  # partner users never see them, their own projects included. Logged by hand; nothing is captured automatically.

  @wip @task:103
  Scenario: I log a phone call about a project
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer has a contact "Dana Levi"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    When I am on the "Acme Ltd" customer page
    And I select "Phone" from "Channel"
    And I select "From the customer" from "Direction"
    And I select "Dana Levi" from "Contact"
    And I select "Panel upgrade" from "Project"
    And I fill in "Summary" with "Asked when the quote will be ready"
    And I press "Log communication"
    Then the communications listed are "Asked when the quote will be ready"
    And the "Communications" section shows "Dana Levi"
    And the "Communications" section shows "Phone"
    When I am on the "Panel upgrade" project page
    Then the "Communications" section shows "Asked when the quote will be ready"

  @wip @task:103
  Scenario: Logging from a project page
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    When I am on the "Panel upgrade" project page
    And I select "WhatsApp" from "Channel"
    And I select "To the customer" from "Direction"
    And I fill in "Summary" with "Sent photos of the panel"
    And I press "Log communication"
    Then the communications listed are "Sent photos of the panel"
    When I am on the "Acme Ltd" customer page
    Then the "Communications" section shows "Sent photos of the panel"
    And the "Communications" section shows "Panel upgrade"

  @wip @task:103
  Scenario: A communication needs a summary and a date not in the future
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    When I am on the "Acme Ltd" customer page
    And I select "Email" from "Channel"
    And I press "Log communication"
    Then I see the error "Write what was said"
    When I fill in "Summary" with "Confirmed the visit"
    And I fill in "Date" with a date 3 days from now
    And I press "Log communication"
    Then I see the error "The date can't be in the future"

  @wip @task:103
  Scenario: I edit and delete an entry, and restore it
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer "Acme Ltd" has a communication saying "Called about access hours"
    When I am on the "Acme Ltd" customer page
    And I press "Edit Called about access hours"
    And I fill in "Summary" with "Called about access hours: 7 to 15"
    And I press "Save communication"
    Then the communications listed are "Called about access hours: 7 to 15"
    When I press "Delete Called about access hours: 7 to 15"
    Then the "Communications" section does not show "Called about access hours: 7 to 15"
    When I restore "Called about access hours: 7 to 15" from the Deleted page
    And I am on the "Acme Ltd" customer page
    Then the communications listed are "Called about access hours: 7 to 15"

  @wip @task:103
  Scenario: The auditor reads the log
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And the customer "Acme Ltd" has a communication saying "Asked for a second quote"
    And I am signed in as an auditor
    When I am on the "Acme Ltd" customer page
    Then the "Communications" section shows "Asked for a second quote"
    And I do not see the "Log communication" button
    And I do not see the "Delete Asked for a second quote" button

  @wip @task:103
  Scenario: Workers and partners see no communications
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" has a communication saying "Customer disputes the price"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then I do not see the text "Communications"
    And I do not see the text "Customer disputes the price"
    When I post a communication for "NW Site"
    Then I see "Project not found", the same as for a made-up project address
    And the "Northwind" user opens the "NW Site" project page
    Then the "Northwind" user sees no "Communications" section on "NW Site"

  @wip @task:103
  Scenario: A contact or project of another customer is refused
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And I have a customer "Initech" with status "Active" and tags "lab"
    And "Initech" has a site "Initech Lab"
    And I have a project named "Lab wiring" at the site "Initech Lab"
    When I am on the "Acme Ltd" customer page
    And I choose "Lab wiring" in "Project" by editing the page
    And I fill in "Summary" with "Wrong project"
    And I press "Log communication"
    Then I see the error "Choose a project of this customer"

  @wip @task:104
  Scenario: Follow-ups due show on the overview
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer "Acme Ltd" has a communication saying "Call back about the quote" with a follow-up 2 days ago
    And the customer "Acme Ltd" has a communication saying "Check the order arrived" with a follow-up 3 days from now
    And the customer "Acme Ltd" has a communication saying "Ask about next year" with a follow-up 30 days from now
    When I open "/dashboard"
    Then the "Follow-ups" section shows "Call back about the quote"
    And the "Follow-ups" section shows "Overdue"
    And the "Follow-ups" section shows "Check the order arrived"
    And the "Follow-ups" section does not show "Ask about next year"

  @wip @task:104
  Scenario: Marking a follow-up done and reopening it
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer "Acme Ltd" has a communication saying "Call back about the quote" with a follow-up 2 days ago
    When I am on the "Acme Ltd" customer page
    And I press "Mark done Call back about the quote"
    Then the "Communications" section shows "Done"
    When I open "/dashboard"
    Then I see the text "No follow-ups due."
    When I am on the "Acme Ltd" customer page
    And I press "Reopen Call back about the quote"
    And I open "/dashboard"
    Then the "Follow-ups" section shows "Call back about the quote"

  @wip @task:104
  Scenario: Who sees follow-ups
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the customer "Acme Ltd" has a communication saying "Call back about the quote" with a follow-up 2 days ago
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open "/dashboard"
    Then I do not see the text "Follow-ups"
    And I do not see the text "Call back about the quote"
    And the auditor opens "/dashboard"
    Then the auditor sees the text "Call back about the quote"
    And the auditor sees no "Mark done Call back about the quote" button
