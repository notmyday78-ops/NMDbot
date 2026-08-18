CREATE TABLE IF NOT EXISTS "jtc_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"base_voice_channel_id" varchar(20) NOT NULL,
	"category_id" varchar(20) NOT NULL,
	"panel_channel_id" varchar(20) NOT NULL,
	"panel_message_id" varchar(20),
	"channel_name_format" varchar(100) DEFAULT '{user}''s Channel' NOT NULL,
	"create_text_channel" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jtc_configs_guild_id_unique" UNIQUE("guild_id")
);

CREATE TABLE IF NOT EXISTS "jtc_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"owner_id" varchar(20) NOT NULL,
	"base_voice_channel_id" varchar(20) NOT NULL,
	"text_channel_id" varchar(20),
	"is_locked" boolean DEFAULT false NOT NULL,
	"user_limit" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jtc_channels_channel_id_unique" UNIQUE("channel_id")
);

DO $$ BEGIN
 ALTER TABLE "jtc_configs" ADD CONSTRAINT "jtc_configs_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "jtc_channels" ADD CONSTRAINT "jtc_channels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
