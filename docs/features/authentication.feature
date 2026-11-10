@zone:shell @task:001
Feature: Authentication
  As a visitor
  I want to create an account and log in once
  So that every part of the product knows who I am

  @smoke
  Scenario: Visitor creates an account
    Given I am on the sign up page
    When I sign up with a new account
    Then I see my email address

  Scenario: Registered user logs in
    Given an existing account
    And I am on the login page
    When I log in with my email and password
    Then I see my email address

  Scenario: Wrong password is rejected
    Given an existing account
    And I am on the login page
    When I log in with the wrong password
    Then I see the error "Invalid email or password"

  # Guesses are capped per account, whatever address they come from (SEC-10).
  @task:090
  Scenario: Too many wrong passwords lock the account for a while
    Given an existing account
    And I am on the login page
    When I log in with the wrong password 5 times
    Then I see the error "Invalid email or password"
    When I log in with my email and password
    Then I see the error "Too many failed sign-ins. Try again in 15 minutes."

  @task:090
  Scenario: A locked account doesn't lock other accounts
    Given an existing account
    And another account was locked by 5 wrong passwords
    And I am on the login page
    When I log in with my email and password
    Then I see my email address

  @task:090
  Scenario: An email without an account answers the same after too many tries
    Given I am on the login page
    When I log in with an email that has no account 5 times
    Then I see the error "Invalid email or password"
    When I log in with that email once more
    Then I see the error "Too many failed sign-ins. Try again in 15 minutes."

  Scenario: Protected page sends visitors to log in
    When I open "/example/account"
    Then I am sent to the login page

  Scenario: One login works across zones
    Given I am signed in with an existing account
    When I open "/example/account"
    Then I see the heading "Your account"
    And I see my email address

  Scenario: User logs out
    Given I am signed in with an existing account
    And I am on the home page
    When I log out
    Then I am sent to the login page

  @task:079
  Scenario: A next address on another site goes to the dashboard after logging in
    Given an existing account
    And I am on the login page to return to "https://other-site.example/"
    When I log in with my email and password
    Then I am on the dashboard
