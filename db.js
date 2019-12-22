const Sequelize = require('sequelize')
const bcrypt = require('bcryptjs')

const DATABASE_URL = process.env.DATABASE_URL

const sequelize = new Sequelize(DATABASE_URL, {
	dialect: 'mysql',
	// logging: false,
})

const globalModelConfig = {
	underscored: true,
	timestamps: true,
	createdAt: 'created_at',
	updatedAt: 'updated_at',
	deletedAt: 'deleted_at',
	paranoid: true,
}

sequelize.authenticate()
	.then(() => {
		// eslint-disable-next-line no-console
		console.log('Connection has been established successfully.')
	})
	.catch((err) => {
		// eslint-disable-next-line no-console
		console.error('Unable to connect to the database:', err)
	})

const SessionModel = sequelize.define('Session', {
	sid: {
		type: Sequelize.STRING,
		primaryKey: true
	},
	expires: Sequelize.DATE,
	data: Sequelize.STRING(50000),
}, globalModelConfig)

const UserModel = sequelize.define('User', {
	uid: {
		type: Sequelize.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	username: Sequelize.STRING(30),
	email: Sequelize.STRING(255),
	password_hash: Sequelize.STRING(255),
}, globalModelConfig)

const PostModel = sequelize.define('Post', {
	id: {
		type: Sequelize.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	guid: {
		type: Sequelize.UUID,
		defaultValue: Sequelize.UUIDV4,
		allowNull: false
	},
	user_id: {
		allowNull: false,
		foreignKey: true,
		references: {
			key: 'uid',
			model: 'users',
		},
		type: Sequelize.INTEGER,
	},
	title: Sequelize.STRING,
	description: Sequelize.TEXT,
	votes: Sequelize.INTEGER,
}, {
	...globalModelConfig,
	indexes: [
		{ unique:true, fields: ['guid'] }
	]
})

PostModel.belongsTo(UserModel, { foreignKey: 'user_id' })
UserModel.hasMany(PostModel, { foreignKey: 'user_id' })

const VoteModel = sequelize.define('Vote', {
	id: {
		type: Sequelize.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	user_id: {
		allowNull: false,
		foreignKey: true,
		references: {
			key: 'uid',
			model: 'users',
		},
		type: Sequelize.INTEGER,
	},
	post_id: {
		allowNull: false,
		foreignKey: true,
		references: {
			key: 'id',
			model: 'posts',
		},
		type: Sequelize.INTEGER,
	},
}, globalModelConfig)

VoteModel.belongsTo(UserModel, { foreignKey: 'user_id', targetKey: 'uid' })
VoteModel.belongsTo(PostModel, { foreignKey: 'post_id', targetKey: 'id' })
UserModel.hasMany(VoteModel, { foreignKey: 'user_id' })
PostModel.hasMany(VoteModel, { foreignKey: 'post_id' })

const CommentModel = sequelize.define('Comment', {
	id: {
		type: Sequelize.INTEGER,
		primaryKey: true,
		autoIncrement: true,
	},
	guid: {
		type: Sequelize.UUID,
		defaultValue: Sequelize.UUIDV4,
		allowNull: false
	},
	user_id: {
		allowNull: false,
		foreignKey: true,
		references: {
			key: 'uid',
			model: 'users',
		},
		type: Sequelize.INTEGER,
	},
	post_id: {
		allowNull: false,
		foreignKey: true,
		references: {
			key: 'id',
			model: 'posts',
		},
		type: Sequelize.INTEGER,
	},
	comment: Sequelize.TEXT
}, {
	...globalModelConfig,
	indexes: [
		{ unique:true, fields: ['guid'] }
	]
})

CommentModel.belongsTo(UserModel, { foreignKey: 'user_id', targetKey: 'uid' })
CommentModel.belongsTo(PostModel, { foreignKey: 'post_id', targetKey: 'id' })
UserModel.hasMany(CommentModel, { foreignKey: 'user_id' })
PostModel.hasMany(CommentModel, { foreignKey: 'post_id' })

sequelize.sync({
	alter: true
})

// const runQuery = (query, values, queryType) => sequelize.query(query, {
// 	replacements: values,
// 	type: queryType || sequelize.QueryTypes.SELECT
// })

const getUserById = uid => UserModel.findOne({ where: { uid } })
const getUserByUsername = username => UserModel.findOne({ where: { username } })
const getUserByEmail = email => UserModel.findOne({ where: { email } })

const isUsernameInUse = async username => {
	return await getUserByUsername(username) !== null
}

const isEmailInUse = async email => {
	return (await getUserByEmail(email) ? true : false)
}

const createUserRecord = userObj => new Promise(async (resolve, reject) => {
	const passwdHash = await createPasswordHash(userObj.password)
	UserModel.create({
		email: userObj.email,
		username: userObj.username,
		password_hash: passwdHash
	})
		.then(createdUser => resolve(createdUser))
		.catch(err => reject(err))
})

const createPasswordHash = password => new Promise(async (resolve, reject) => {
	try {
		const saltRounds = 10
		bcrypt.hash(password, saltRounds, (err, hash) => {
			resolve(hash)
		})
	}
	catch (err) {
		reject(err)
	}
})

const isPasswordHashVerified = (hash, password) => new Promise(async (resolve, reject) => {
	try {
		bcrypt.compare(password, hash, (err, res) => {
			resolve(res)
		})
	}
	catch (err) {
		reject(err)
	}
})

const getPosts = (uid) => PostModel.findAll({
	attributes: {
		...(uid ? {
			include: [
				[Sequelize.literal(`SUM(IF(votes.user_id = ${uid}, 1, 0))`), 'isVoted']
			]
		} : {})
	},
	include: [
		{
			model: VoteModel,
			attributes: [],
		}
	],
	group: 'Post.id',
	order: [['votes', 'desc']]
})

const getPostByGuid = (uid, guid) => new Promise((resolve, reject) => {
	PostModel.findAll({
		attributes: {
			...(uid ? {
				include: [
					[Sequelize.literal(`SUM(IF(votes.user_id = ${uid}, 1, 0))`), 'isVoted']
				]
			} : {})
		},
		include: [
			{
				model: VoteModel,
				attributes: [],
			},
		],
		group: 'Post.id',
		where: {
			guid
		}
	})
		.then((posts) => resolve(posts[0]))
		.catch((err) => reject(err))
})

const createPost = (userId, postObj) => new Promise((resolve, reject) => {
	PostModel.create({
		user_id: userId,
		title: postObj.title,
		description: postObj.description,
		votes: 0,
	})
		.then(createdPost => resolve(createdPost))
		.catch(err => reject(err))
})

const incrementVoteCountForPostById = postId => PostModel.update(
	{ votes: Sequelize.literal('votes + 1') },
	{ where: { id: postId } }
)

const decrementVoteCountForPostById = postId => PostModel.update(
	{ votes: Sequelize.literal('votes - 1') },
	{ where: { id: postId } }
)

const getPostVoteByUidAndPostId = (uid, postId) => VoteModel.findOne({ where: { user_id: uid, post_id: postId } })

const deletePostVoteByUidAndPostId = (uid, postId) => new Promise((resolve, reject) => {
	getPostVoteByUidAndPostId(uid, postId)
		.then(existingVoteObj => {
			if (!existingVoteObj) return reject(new Error('Vote not found!'))
			existingVoteObj.destroy()
				.then(deletedVoteObj => resolve())
				.catch(err => reject(err))
		})
		.catch(err => reject(err))
})

const votePostByGuid = (uid, postGuid) => new Promise((resolve, reject) => {
	getPostByGuid(uid, postGuid)
		.then((post) => {
			// Was it voted before?
			getPostVoteByUidAndPostId(uid, post.id)
				.then(existingVoteObj => {
					if (existingVoteObj) {
						// Has a vote currently, remove the vote
						deletePostVoteByUidAndPostId(uid, post.id)
							.then(() => {
								decrementVoteCountForPostById(post.id)
									.then(() => resolve())
									.catch(err => reject(err))
							})
							.catch(err => reject(err))
					}
					else {
						// Not voted before, add vote
						VoteModel.create({
							user_id: uid,
							post_id: post.id,
						})
							.then(createdVote => {
								incrementVoteCountForPostById(post.id)
									.then(() => resolve())
									.catch(err => reject(err))
							})
							.catch(err => reject(err))
					}
				})
				.catch(err => reject(err))
		})
		.catch(err => reject(err))
})

const getPostComments = (postSqObj) => postSqObj.getComments({
	include: [
		{
			model: UserModel
		}
	]
})

const getCommentByGuid = (guid) => CommentModel.findOne({ where: { guid } })

const createCommentByPostGuid = (uid, postGuid, comment) => new Promise((resolve, reject) => {
	getPostByGuid(uid, postGuid)
		.then((post) => {
			CommentModel.create({
				user_id: uid,
				post_id: post.id,
				comment
			})
				.then(createdComment => resolve(createdComment))
				.catch(err => reject(err))
		})
		.catch(err => reject(err))
})

const deleteCommentByCommentGuid = (commentGuid) => new Promise((resolve, reject) => {
	CommentModel.findOne({ where: { guid: commentGuid } })
		.then((comment) => {
			comment.destroy()
				.then(() => resolve())
				.catch(err => reject(err))
		})
		.catch(err => reject(err))
})

module.exports = (session) => {
	const SequelizeStore = require('connect-session-sequelize')(session.Store)
	
	const SessionStore = new SequelizeStore({
		db: sequelize,
		table: 'Session'
	})

	return {
		SessionStore,
		getUserById,
		getUserByUsername,
		getUserByEmail,
		isUsernameInUse,
		isEmailInUse,
		createUserRecord,
		isPasswordHashVerified,
		getPosts,
		getPostByGuid,
		createPost,
		votePostByGuid,
		getPostComments,
		getCommentByGuid,
		createCommentByPostGuid,
		deleteCommentByCommentGuid,
	}
}
