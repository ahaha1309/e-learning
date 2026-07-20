const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { Strategy: LocalStrategy } = require('passport-local');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');

const User = require('../models/User');
const { upsertOAuthUser } = require('../controller/auth/auth.service');

function cookieExtractor(req) {
  return req && req.cookies ? req.cookies.accessToken : null;
}

function configurePassport(passport) {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });

  passport.use(
    new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +refreshTokenHash');

        if (!user || user.provider !== 'local') {
          return done(null, false, { message: 'Invalid email or password.' });
        }

        const passwordMatches = await user.comparePassword(password);
        if (!passwordMatches) {
          return done(null, false, { message: 'Invalid email or password.' });
        }

        if (user.status === 'rejected') {
          return done(null, false, { message: 'This account has been rejected.' });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
        secretOrKey: process.env.JWT_SECRET || 'test_secret',
      },
      async (payload, done) => {
        try {
          const user = await User.findById(payload.sub);
          done(null, user || false);
        } catch (error) {
          done(error, false);
        }
      }
    )
  );

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await upsertOAuthUser(profile, 'google');
            done(null, user);
          } catch (error) {
            done(error);
          }
        }
      )
    );
  }

  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID,
          clientSecret: process.env.FACEBOOK_APP_SECRET,
          callbackURL: process.env.FACEBOOK_CALLBACK_URL,
          profileFields: ['id', 'displayName', 'emails', 'photos'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const user = await upsertOAuthUser(profile, 'facebook');
            done(null, user);
          } catch (error) {
            done(error);
          }
        }
      )
    );
  }
}

module.exports = configurePassport;
