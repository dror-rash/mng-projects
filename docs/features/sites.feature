@zone:dashboard @task:054
Feature: Sites
  As an admin
  I want to record the physical sites of a customer or sub-company, with the people to meet there
  So that the people doing the work know where to go, how to get in and who to call (ADR-0008)

  Background:
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"

  Scenario: Add a site from the customer's page
    Given I am on the "Acme Ltd" customer page
    When I follow the "New site" link
    And I fill in "Site name" with "Haifa warehouse"
    And I fill in "Address" with "12 Port Rd, Haifa"
    And I fill in "Access notes" with "Gate code 4411. Report to security first."
    And I press "Save site"
    Then I see the heading "Haifa warehouse"
    And I see the "Acme Ltd" link
    And I see the text "12 Port Rd, Haifa"
    And I see the text "Gate code 4411. Report to security first."
    And I see the "Open in maps" link
    When I follow the "Acme Ltd" link
    Then the "Sites" section shows "Haifa warehouse"

  Scenario: Coordinates are optional, and checked when given
    Given "Acme Ltd" has a site "Haifa warehouse"
    When I open the "Haifa warehouse" site page
    And I follow the "Edit site" link
    And I fill in "Latitude" with "132.8"
    And I fill in "Longitude" with "35.0"
    And I press "Save site"
    Then I see the error "Enter a latitude between -90 and 90"
    When I fill in "Latitude" with "32.8"
    And I press "Save site"
    Then I see the heading "Haifa warehouse"
    And I see the text "32.8, 35"

  Scenario: Only one coordinate is not enough
    When I open the new site page for "Acme Ltd"
    And I fill in "Site name" with "Haifa warehouse"
    And I fill in "Latitude" with "32.8"
    And I press "Save site"
    Then I see the error "Enter both latitude and longitude, or neither"

  Scenario: A site needs a name
    When I open the new site page for "Acme Ltd"
    And I fill in "Site name" with "   "
    And I press "Save site"
    Then I see the error "Site name is required"

  @task:114
  Scenario: A site saved before the page has finished loading still opens
    Given my connection is so slow that pages haven't finished loading when I use them
    When I open the new site page for "Acme Ltd"
    And I fill in "Site name" with "Haifa warehouse"
    And I press "Save site"
    Then I see the heading "Haifa warehouse"
    And I see the "Acme Ltd" link

  Scenario: Add, edit and remove the people to meet on site
    Given "Acme Ltd" has a site "Haifa warehouse"
    When I open the "Haifa warehouse" site page
    And I fill in "Contact name" with "Yossi Mizrahi"
    And I fill in "Role" with "Facility manager"
    And I fill in "Contact phone" with "+972 4 555 0123"
    And I press "Add contact"
    Then the "On-site contacts" section shows "Yossi Mizrahi"
    And the "On-site contacts" section shows "Facility manager"
    When I follow the "Edit Yossi Mizrahi" link
    And I fill in "Role" with "Security lead"
    And I press "Save contact"
    Then the "On-site contacts" section shows "Security lead"
    When I press "Remove Yossi Mizrahi"
    Then the "On-site contacts" section does not show "Yossi Mizrahi"

  Scenario: On-site contacts are separate from the customer's contacts
    Given "Acme Ltd" has a site "Haifa warehouse"
    And the site "Haifa warehouse" has a contact "Yossi Mizrahi"
    When I am on the "Acme Ltd" customer page
    Then the "Contacts" section does not show "Yossi Mizrahi"

  Scenario: Delete a site and restore it
    Given "Acme Ltd" has a site "Haifa warehouse"
    When I open the "Haifa warehouse" site page
    And I follow the "Delete site" link
    And I press "Yes, delete site"
    Then the URL path is the "Acme Ltd" customer page
    And the "Sites" section does not show "Haifa warehouse"
    When I restore "Haifa warehouse" from the Deleted page
    And I am on the "Acme Ltd" customer page
    Then the "Sites" section shows "Haifa warehouse"

  Scenario: A deleted customer's sites go with it and come back with it
    Given "Acme Ltd" has a site "Haifa warehouse"
    And I keep the link to the "Haifa warehouse" site
    When I delete the customer "Acme Ltd"
    And I open the kept site link
    Then I see "Site not found", the same as for a made-up site address
    When I restore "Acme Ltd" from the Deleted page
    And I open the kept site link
    Then I see the heading "Haifa warehouse"

  Scenario: A site can't be restored before its customer
    Given "Acme Ltd" has a site "Haifa warehouse"
    When I open the "Haifa warehouse" site page
    And I follow the "Delete site" link
    And I press "Yes, delete site"
    And I delete the customer "Acme Ltd"
    When I restore "Haifa warehouse" from the Deleted page
    Then I see the error "Restore its customer first"

  Scenario: Another workspace's site is not found
    Given another user has a customer "Secret Corp" with a site "Vault"
    When I open the other user's site page
    Then I see "Site not found", the same as for a made-up site address

  Scenario: A new site can't be started for another workspace's customer
    Given another user has a customer named "Secret Corp"
    When I open the new site page for the other user's customer
    Then I see the text "Customer not found"
