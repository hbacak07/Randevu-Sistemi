import 'dotenv/config';
import Joi from 'joi';

/**
 * Ortam değişkenlerini uygulama açılışında Joi ile doğrularız.
 * Eksik/hatalı bir değer varsa uygulama hiç başlamaz — hatayı erkenden görürsün.
 */
const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).default('redis://localhost:6379'),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  REMINDER_MINUTES_BEFORE: Joi.number().integer().min(1).default(60),
}).unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  console.error('❌ Ortam değişkenleri hatalı:\n' + error.details.map((d) => ' - ' + d.message).join('\n'));
  process.exit(1);
}

export const config = {
  env: value.NODE_ENV as string,
  port: value.PORT as number,
  databaseUrl: value.DATABASE_URL as string,
  redisUrl: value.REDIS_URL as string,
  jwtSecret: value.JWT_SECRET as string,
  jwtExpiresIn: value.JWT_EXPIRES_IN as string,
  corsOrigin: (value.CORS_ORIGIN as string).split(',').map((s) => s.trim()),
  reminderMinutesBefore: value.REMINDER_MINUTES_BEFORE as number,
};
