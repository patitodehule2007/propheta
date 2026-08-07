import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("monitored_accounts", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.text("platform_user_id").notNullable().unique();
        table.text("handle").notNullable();
        table.boolean("is_active").notNullable().defaultTo(true);
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("monitored_accounts", (table) => {
        table.index("platform_user_id", "idx_monitored_accounts_platform_user_id");
    });

    await knex.schema.createTable("x_webhook_subscriptions", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("monitored_account_id")
            .notNullable()
            .references("id")
            .inTable("monitored_accounts")
            .withKeyName("fk_x_webhook_subscriptions_monitored_accounts");
        table.text("event_type").notNullable();
        table.text("platform_subscription_id").notNullable().unique();
        table.text("webhook_id").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("x_webhook_subscriptions", (table) => {
        table.index("monitored_account_id", "idx_x_webhook_subscriptions_monitored_account_id");
    });

    await knex.schema.createTable("ingested_posts", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("monitored_account_id")
            .notNullable()
            .references("id")
            .inTable("monitored_accounts")
            .withKeyName("fk_ingested_posts_monitored_accounts");
        table.text("platform_post_id").notNullable().unique();
        table.text("raw_text").notNullable();
        table.timestamp("received_at", { useTz: true }).notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("ingested_posts", (table) => {
        table.index("monitored_account_id", "idx_ingested_posts_monitored_account_id");
    });

    await knex.schema.createTable("decision_log", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("ingested_post_id")
            .nullable()
            .references("id")
            .inTable("ingested_posts")
            .withKeyName("fk_decision_log_ingested_posts");
        table.text("platform_post_id").nullable();
        table.text("stage").notNullable();
        table.text("decision").notNullable();
        table.text("reason").nullable();
        table.jsonb("metadata").nullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("decision_log", (table) => {
        table.index("ingested_post_id", "idx_decision_log_ingested_post_id");
        table.index("platform_post_id", "idx_decision_log_platform_post_id");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("decision_log");
    await knex.schema.dropTableIfExists("ingested_posts");
    await knex.schema.dropTableIfExists("x_webhook_subscriptions");
    await knex.schema.dropTableIfExists("monitored_accounts");
}
