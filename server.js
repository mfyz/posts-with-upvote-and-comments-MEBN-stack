const express = require('express')
const bodyParser = require('body-parser')
const hbs = require( 'express-handlebars')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const csurf = require('csurf')
const helmet = require('helmet')
const passport = require('passport')
const md5 = require('md5')
const LocalStrategy = require('passport-local').Strategy
const db = require('./db')(session)
const helpers = require('handlebars-helpers')()
const markdownHelper = require('helper-markdown')
const momentHelper = require('helper-moment')

const PORT = process.env.PORT || 4008

// express app
const app = express()
app.set('view engine', 'hbs')
app.engine('hbs', hbs({
	extname: 'hbs',
	defaultView: 'default',
	layoutsDir: __dirname + '/views/layouts/',
	partialsDir: __dirname + '/views/partials/',
	helpers: {
		...helpers,
		md5: str => md5(str),
		markdown: markdownHelper(),
		momento: momentHelper
	}
}))
app.use(cookieParser())
app.use(express.static('public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(session({
	secret: 'awesome auth',
	store: db.SessionStore,
	resave: false,
	saveUninitialized: true
}))

// security
const csrf = csurf({ cookie: true })
app.use(helmet())
app.use(csrf)
app.use((err, req, res, next) => {
	if (err.code !== 'EBADCSRFTOKEN') return next(err)
	res.status(403).render('error', { message: 'Invalid form submission!' })
})

// passport
app.use(passport.initialize())
app.use(passport.session())
const passportConfig = { failureRedirect: '/login' }

const authRequired = (req, res, next) => {
	if (req.user) return next()
	else res.redirect('/login?required=1')
}

app.use((req, res, next) => {
	res.locals.user = req.user
	res.locals.isLoggedIn = (req.user && req.user.uid > 0)
	next()
})

passport.use(new LocalStrategy((username, password, done) => {
	db.getUserByUsername(username)
		.then(async (user) => {
			if (!user) return done(new Error('User not found!'), false)
			if (!(await db.isPasswordHashVerified(user.password_hash, password))) return done(new Error('Invalid Password'), false)
			return done(null, user)
		})
		.catch((err) => {
			return done(err)
		})
}))

passport.serializeUser((user, cb) => {
	cb(null, user.uid)
})

passport.deserializeUser((uid, cb) => {
	db.getUserById(uid)
		.then((user) => {
			cb(null, user)
		})
		.catch((err) => {
			cb(err, null)
		})
})

/* Routes */

app.get('/', async (req, res) => {
	const postsSqObj = await db.getPosts(req.user && req.user.uid)
	const posts = JSON.parse(JSON.stringify(postsSqObj))
	// console.log(posts)
	res.render('posts', {
		posts
	})
})

app.all('/new', authRequired, (req, res) => {
	new Promise(async (resolve, reject) => {
		if (req.method === 'GET') { return reject() }
		if (Object.keys(req.body).length > 0) {
			if (
				!(req.body.title && req.body.title.length > 3)
				|| !(req.body.description && req.body.description.length > 3)
			) {
				reject(new Error('Please fill all fields'))
			}
			else {
				resolve(true)
			}
		}
		else {
			resolve(false)
		}
	})
		.then(() => new Promise((resolve, reject) => {
			db.createPost(req.user.uid, {
				title: req.body.title,
				description: req.body.description,
			})
				.then((createdPost) => {
					res.render('new-success', {
						postGuid: createdPost.guid
					})
				})
				.catch(err => reject(err))
		}))
		.catch((error) => {
			let errorMsg = (error && error.message) || ''
			res.render('new', {
				csrfToken: req.csrfToken(),
				hasError: (errorMsg && errorMsg.length > 0),
				error: errorMsg,
				form: req.body
			})
		})
})

app.all('/post/:guid', (req, res) => {
	const uid = (req.user && req.user.uid) || null
	db.getPostByGuid(uid, req.params.guid)
		.then(async (postSqObj) => {
			const commentsSqObj = await db.getPostComments(postSqObj)
			const post = JSON.parse(JSON.stringify(postSqObj))
			const comments = JSON.parse(JSON.stringify(commentsSqObj))
			// console.log(comments)
			// console.log(post)
			res.render('post-detail', {
				csrfToken: req.csrfToken(),
				post,
				comments,
			})
		})
		.catch(err => res.render('error', { message: err.message }))
})

app.all('/post/:guid/vote', authRequired, (req, res) => {
	db.votePostByGuid(req.user.uid, req.params.guid)
		.then((post) => {
			res.send(`<script>location.href='/post/${req.params.guid}'</script>`)
		})
		.catch(err => res.render('error', { message: err.message }))
})

app.post('/post/:guid/comment', authRequired, (req, res) => {
	const comment = (req.body && req.body.comment)
	if (!comment) return res.render('error', { message: 'Comment is required!' })
	db.createCommentByPostGuid(req.user.uid, req.params.guid, comment)
		.then((comment) => {
			res.send(`<script>location.href='/post/${req.params.guid}?${Date.now()}'</script>`)
		})
		.catch(err => res.render('error', { message: err.message }))
})

app.get('/post/:guid/comment/:cguid/delete', authRequired, (req, res) => {
	db.getCommentByGuid(req.params.cguid)
		.then((comment) => {
			if (comment.user_id !== req.user.uid) {
				return res.render('error', { message: "You don't have permission to delete this comment." })
			}
			db.deleteCommentByCommentGuid(req.params.cguid)
				.then(() => {
					res.send(`<script>location.href='/post/${req.params.guid}?${Date.now()}'</script>`)
				})
				.catch(err => res.render('error', { message: err.message }))
		})
		.catch(err => res.render('error', { message: err.message }))
})

app.all('/login', (req, res, next) => {
	new Promise((resolve, reject) => {
		if (req.method === 'GET') { return reject() }
		if (req.body.username && req.body.password) {
			passport.authenticate('local', (err, user, info) => {
				if (!err && user) {
					return resolve(user)
				}
				reject(err)
			})(req, res, next)
		}
		else {
			reject(new Error('Please fill all fields'))
		}
	})
		.then(user => new Promise((resolve, reject) => {
			req.login(user, err => { // save authentication
				if (err) return reject(err)
				return res.send('<script>location.href="/";</script>')
			})
		}))
		.catch(error => {
			let errorMsg = (error && error.message) || ''
			if (!error && req.query.required) errorMsg = 'Authentication required for this page.'
			res.render('login', {
				csrfToken: req.csrfToken(),
				hasError: (errorMsg && errorMsg.length > 0),
				errorMsg,
				form: req.body,
			})
		})
})

app.all('/register', (req, res) => {
	new Promise(async (resolve, reject) => {
		if (Object.keys(req.body).length > 0) {
			if (
				!(req.body.email && req.body.email.length > 5)
				|| !(req.body.username && req.body.username.length > 1)
				|| !(req.body.password && req.body.password.length > 3)
				|| !(req.body.password2 && req.body.password2.length > 3)
			) {
				reject(new Error('Please fill all fields'))
			}
			else if (!(
				req.body.email.indexOf('@') !== -1 
				&& req.body.email.indexOf('.') !== -1
			)) {
				reject(new Error('Invalid email address'))
			}
			else if (req.body.password !== req.body.password2) {
				reject(new Error("Password don't match"))
			}
			else if (await db.isUsernameInUse(req.body.username)) {
				reject(new Error('Username is taken'))
			}
			else if (await db.isEmailInUse(req.body.email)) {
				reject(new Error('Email address is already registered'))
			}
			else {
				resolve(true)
			}
		}
		else {
			resolve(false)
		}
	})
		.then(isValidFormData => new Promise((resolve, reject) => {
			if (Object.keys(req.body).length > 0 && isValidFormData) {
				db.createUserRecord({
					username: req.body.username,
					email: req.body.email,
					password: req.body.password
				})
					.then((createdUser) => {
						// console.log('====> user created...')
						// console.log(creationSuccessful)
						// authenticate?
						resolve(createdUser)
					})
					.catch(err => reject(err))
			}
			else {
				resolve(false)
			}
		}))
		.then((createdUserRecord) => {
			if (createdUserRecord) {
				// Log them in in the session
				req.login(createdUserRecord, (err) => {
					console.log(err)
				})
				res.render('register-success')
			}
			else {
				res.render('register', {
					csrfToken: req.csrfToken(),
					hasError: false,
					form: req.body
				})
			}
		})
		.catch((error) => {
			let errorMsg = (error && error.message) || ''
			res.render('register', {
				csrfToken: req.csrfToken(),
				hasError: (errorMsg && errorMsg.length > 0),
				error: errorMsg,
				form: req.body
			})
		})
})

app.get('/logout', authRequired, (req, res) => {
	req.logout()
	return res.send('<script>location.href="/";</script>')
})

app.get('*', (req, res) => {
	res.render('error', { message: 'Page not found!' })
})

// App start
app.listen(PORT, () => console.log(`App listening on port ${PORT}!`))
