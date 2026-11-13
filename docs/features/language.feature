@zone:shell
Feature: Hebrew and English
  As someone using the app
  I want to switch between Hebrew and English
  So that I work in my own language, right to left in Hebrew (ADR-0011)

  # Every other feature file runs in English: the test browser prefers English and sets no language.
  # The Hebrew texts here are the defaults the owner reviews; a wording change is a docs(features) commit.

  @wip @task:094
  Scenario: Choosing Hebrew turns the app right to left, across zones and reloads
    Given I am signed in with an existing account
    When I open "/dashboard"
    And I choose the "עברית" language
    Then the page is right to left
    And the dashboard menu links are "סקירה, כל הפרויקטים, לקוחות"
    When I reload the page
    Then the page is right to left
    When I log out
    Then I am sent to the login page
    And the page is right to left
    And I see the heading "ברוכים השבים"

  @wip @task:094
  Scenario: Switching back to English
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    When I open "/dashboard"
    And I choose the "English" language
    Then the page is left to right
    And the dashboard menu links are "Overview, All projects, Customers"

  @wip @task:094
  Scenario: A Hebrew browser starts in Hebrew
    Given my browser prefers "he-IL"
    And I am on the login page
    Then the page is right to left
    And I see the heading "ברוכים השבים"

  @wip @task:094
  Scenario: Any other browser starts in English
    Given my browser prefers "fr-FR"
    And I am on the login page
    Then the page is left to right
    And I see the heading "Welcome back"

  @wip @task:094
  Scenario: An unknown language in the cookie falls back
    Given my language cookie is set to "xx"
    And I am on the login page
    Then the page is left to right
    And I see the heading "Welcome back"

  @wip @task:095
  Scenario: My language follows me to another browser
    Given I am signed in with an existing account
    When I open "/dashboard"
    And I choose the "עברית" language
    And I log in from another browser
    Then the page is right to left
    And the dashboard menu links are "סקירה, כל הפרויקטים, לקוחות"

  @wip @task:095
  Scenario: Without a saved choice, the browser's language stays
    Given my browser prefers "he-IL"
    And an existing account
    And I am on the login page
    When I log in with my email and password
    Then the page is right to left

  @wip @task:095
  Scenario: Each person gets their own language on a shared computer
    Given I am signed in with an existing account
    When I open "/dashboard"
    And I choose the "עברית" language
    And I log out
    And the teammate logs in on this browser
    Then the page is left to right
    When the teammate logs out
    And I log in with my email and password
    Then the page is right to left

  @wip @task:096
  Scenario: In Hebrew the layout mirrors and fits a phone
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a project named "Panel upgrade"
    When my screen is 360 pixels wide
    And I am on the "Panel upgrade" project page
    Then the page is right to left
    And the page does not scroll sideways
    When my screen is 1024 pixels wide
    And I open "/dashboard"
    Then the menu is on the right
    And the page does not scroll sideways

  @wip @task:096
  Scenario: Dates follow the language
    Given I am signed in with an existing account
    And I have a project named "Panel upgrade"
    And the project has a task "Replace breaker"
    And the task "Replace breaker" is due 7 days from today
    And my language cookie is set to "he"
    When I open the "Replace breaker" task
    Then the task "Replace breaker" shows the due date 7 days from today written day.month.year

  @wip @task:096
  Scenario: Text people write keeps its own direction
    Given I am signed in with an existing account
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    When I am on the "Acme Ltd" customer page
    And I add the note "הלקוח ביקש הצעת מחיר"
    Then the note "הלקוח ביקש הצעת מחיר" reads right to left
    And the page is left to right

  @wip @task:097
  Scenario: The login page in Hebrew
    Given an existing account
    And my language cookie is set to "he"
    And I am on the login page
    Then I see the heading "ברוכים השבים"
    When I log in with the wrong password
    Then I see the error "אימייל או סיסמה שגויים"

  @wip @task:097
  Scenario: The sign-up page in Hebrew
    Given my language cookie is set to "he"
    And I am on the sign up page
    When I fill in "אימייל" with "not-an-email"
    And I press "הרשמה"
    Then I see the error "יש להזין כתובת אימייל תקינה"

  @wip @task:098
  Scenario: The overview and a project's board in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a project named "Panel upgrade"
    When I open "/dashboard"
    Then I see the heading "סקירה"
    When I am on the "Panel upgrade" project page
    Then I see the heading "לביצוע"
    And I see the heading "בתהליך"
    And I see the heading "הושלם"

  @wip @task:098
  Scenario: A project form error in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a project named "Panel upgrade"
    When I am on the edit page of the "Panel upgrade" project
    And I fill in "שם הפרויקט" with ""
    And I press "שמירת שינויים"
    Then I see the error "יש להזין שם לפרויקט"

  @wip @task:099
  Scenario: Customers in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    When I open "/dashboard/customers"
    Then I see the heading "לקוחות"
    And the "סטטוס" select offers "כל הסטטוסים, ליד, פעיל, לשעבר" with "כל הסטטוסים" chosen

  @wip @task:099
  Scenario: A customer form error in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    When I open the edit page of the customer "Acme Ltd"
    And I fill in "אימייל" with "not-an-email"
    And I press "שמירת לקוח"
    Then I see the error "יש להזין כתובת אימייל תקינה"

  @wip @task:100
  Scenario: Visits in Hebrew
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a customer "Acme Ltd" with status "Active" and tags "retail"
    And "Acme Ltd" has a site "Haifa warehouse"
    And I have a project named "Panel upgrade" at the site "Haifa warehouse"
    When I am on the "Panel upgrade" project page
    Then I see the "ביקורים" section
    When I follow the "תיעוד ביקור" link
    And I fill in "תאריך הביקור" with a date 3 days from now
    And I press "שמירת ביקור"
    Then I see the error "ביקור לא יכול להיות בעתיד"

  @wip @task:100
  Scenario: What people type stays as typed
    Given I am signed in with an existing account
    And my language cookie is set to "he"
    And I have a draft reading form "Panel check" with the field "Voltage"
    When I open the form "Panel check"
    Then I see the heading "Panel check"
    And the fields listed are "Voltage"
