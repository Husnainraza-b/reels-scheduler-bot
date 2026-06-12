import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  ENCRYPTION_KEY: Joi.string().length(32).required(),
  CRON_SECRET: Joi.string().required(),
  ADMIN_PASSWORD: Joi.string().required(),
  SUPABASE_URL: Joi.string().uri().required(),
  SUPABASE_SERVICE_ROLE_KEY: Joi.string().required(),
  SLACK_SIGNING_SECRET: Joi.string().required(),
  SLACK_BOT_TOKEN: Joi.string().required(),
  R2_ACCESS_KEY_ID: Joi.string().required(),
  R2_SECRET_ACCESS_KEY: Joi.string().required(),
  R2_ENDPOINT: Joi.string().uri().required(),
  R2_BUCKET_NAME: Joi.string().required(),
  R2_PUBLIC_DEV_URL: Joi.string().uri().required(),
  META_GRAPH_API_VERSION: Joi.string().valid('v20.0').default('v20.0'),
  FRONTEND_URL:        Joi.string().uri().optional(),
  SLACK_ALERT_CHANNEL: Joi.string().default('#general'),
});
