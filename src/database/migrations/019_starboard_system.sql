CREATE TABLE IF NOT EXISTS "starboard_messages" (
	"message_id" varchar(20) PRIMARY KEY NOT NULL,
	"guild_id" varchar(20) NOT NULL,
	"channel_id" varchar(20) NOT NULL,
	"author_id" varchar(20) NOT NULL,
	"starboard_message_id" varchar(20),
	"stars" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "starboard_settings" (
	"guild_id" varchar(20) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(20),
	"threshold" integer DEFAULT 3 NOT NULL,
	"emoji" varchar(50) DEFAULT '⭐' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
