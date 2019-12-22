# Posts with Upvoting and Comments (MEBN Stack)

### Features
- Simple email/username/password authentication (that can be extended easily with passport's authentication strategies)
- Posts (Kept it very generic so it can be named as anything you want - Top Sites, New Ideas...)
- Unique votes per posts (1 vote per user per post)
- Linear Comments
- Markdowns supported in post description and comment text fields - without any limitation (For public use, I suggest an additional moderation for comments and posts containing potentially dangerious or spam content).

Note: There is only csrf protection on forms (register/login/new-post/new-comment). I highly suggest you to add additional measurements/limitations or at least captcha protection for preventing possible flooding on your database if anyone wants to automate submissions.

### Stack
- Node/Express
- PassportJS (Authentication)
- Express Session + Passport Session with Sequelize Store (Persisting session data in the SQL db)
- Sequelize with MySQL (but can be easily switched to SQLite, PgSQL...)
- Handlebars as views engine
- Bootstrap + Aragon theme

### Run

1. `npm install`
2. `node index.js`
