@zone:dashboard
Feature: Work orders
  As an admin
  I want to record the customer's order, who authorised it, the payment terms and the order document
  So that we only start work that was ordered, and billing knows the terms (ADR-0012)

  # Work orders are commercial records: admins write them, auditors read them, workers and partner users
  # never see them, their own projects included.

  @wip @task:106
  Scenario: I record a work order from an authorised contact
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer has a contact "Dana Levi"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" is at the stage "Quote"
    And the contact "Dana Levi" is authorised to order
    When I am on the "Panel upgrade" project page
    And I follow the "Record a work order" link
    And I fill in "Order number" with "PO-4471"
    And I select "Dana Levi" from "Ordered by"
    And I select "Net 30" from "Payment terms"
    And I press "Save work order"
    Then the work orders listed are "PO-4471"
    And the "Work orders" section shows "Dana Levi"
    And the "Work orders" section shows "Net 30"
    And the project shows "Quote" since today
    When I press "Move to Ordered"
    Then the project shows "Ordered" since today

  @wip @task:106
  Scenario: Only an authorised contact can order
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer has a contact "Dana Levi"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    When I am on the "Panel upgrade" project page
    And I follow the "Record a work order" link
    Then I see the text "No one at Acme Ltd is authorised to order yet."
    When I choose "Dana Levi" in "Ordered by" by editing the page
    And I select "Net 30" from "Payment terms"
    And I press "Save work order"
    Then I see the error "Choose someone authorised to order"

  @wip @task:106
  Scenario: A work order's terms and date are checked
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And the customer has a contact "Dana Levi"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the contact "Dana Levi" is authorised to order
    When I am on the "Panel upgrade" project page
    And I follow the "Record a work order" link
    And I select "Dana Levi" from "Ordered by"
    And I select "Other" from "Payment terms"
    And I press "Save work order"
    Then I see the error "Describe the payment terms"
    When I fill in "Payment terms note" with "Half up front, half on completion"
    And I fill in "Ordered on" with a date 3 days from now
    And I press "Save work order"
    Then I see the error "The order date can't be in the future"

  @wip @task:106
  Scenario: I delete a work order, and restore it
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" has the work order "PO-4471"
    When I am on the "Panel upgrade" project page
    And I press "Delete PO-4471"
    Then the "Work orders" section does not show "PO-4471"
    When I restore "PO-4471" from the Deleted page
    And I am on the "Panel upgrade" project page
    Then the work orders listed are "PO-4471"

  @wip @task:106
  Scenario: Who sees work orders
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" has the work order "PO-4471"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I am on the "NW Site" project page
    Then I do not see the text "Work orders"
    And I do not see the text "PO-4471"
    And the "Northwind" user opens the "NW Site" project page
    Then the "Northwind" user sees no "Work orders" section on "NW Site"
    And the auditor opens the "NW Site" project page
    Then the auditor sees the text "PO-4471"
    And the auditor sees no "Record a work order" link

  @wip @task:107
  Scenario: I upload the order's document
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" has the work order "PO-4471"
    When I am on the "Panel upgrade" project page
    And I add the file "po-4471.pdf" with "Upload the order"
    Then the "Work orders" section shows the file "po-4471.pdf"
    And the "Photos and files" section does not show "po-4471.pdf"
    And the file "po-4471.pdf" downloads as "po-4471.pdf"

  @wip @task:107
  Scenario: An order document must be a document, up to 50 MB
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" has the work order "PO-4471"
    When I am on the "Panel upgrade" project page
    And I add the file "order.exe" with "Upload the order"
    Then I see the error "Orders must be PDF, Word, Excel, CSV, text or images"
    When I add a 60 MB file "order.pdf" with "Upload the order"
    Then I see the error "Orders can be up to 50 MB"

  @wip @task:107
  Scenario: The order document stays hidden from workers and partners
    Given a workspace with the partners "Northwind" and "Globex", an admin and an auditor
    And the customer "Acme Ltd" is assigned to "Northwind" and "Globex"
    And "Northwind" has the project "NW Site" for "Acme Ltd" with the task "Copy"
    And the project "NW Site" has the work order "PO-4471" with the document "po-4471.pdf"
    And I am signed in as a worker
    And I am on the crew of "NW Site"
    When I open the address of the order document "po-4471.pdf"
    Then it is not found, the same as a made-up photo address
    And the "Northwind" user opening the address of the order document "po-4471.pdf" finds nothing, the same as a made-up photo address

  @wip @task:107
  Scenario: I delete an order document, and restore it
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    And the project "Panel upgrade" has the work order "PO-4471" with the document "po-4471.pdf"
    When I am on the "Panel upgrade" project page
    And I press "Delete po-4471.pdf"
    Then the "Work orders" section does not show "po-4471.pdf"
    When I restore "po-4471.pdf" from the Deleted page
    And I am on the "Panel upgrade" project page
    Then the "Work orders" section shows the file "po-4471.pdf"
