import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("topic_market_map", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.text("topic").notNullable().unique();
        table.jsonb("kalshi_tags").notNullable();
        table.integer("default_horizon_minutes").notNullable();
        table.boolean("is_active").notNullable().defaultTo(true);
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable("kalshi_series", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.text("series_ticker").notNullable().unique();
        table.text("title").notNullable();
        table.text("category").notNullable();
        table.jsonb("tags").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.bigInteger("volume").notNullable().defaultTo(0);
        table.text("fee_type").notNullable();
        table.decimal("fee_multiplier", null).notNullable();
        table.jsonb("additional_prohibitions").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.timestamp("source_updated_at", { useTz: true }).nullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    await knex.schema.createTable("kalshi_markets", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.text("ticker").notNullable().unique();
        table
            .uuid("kalshi_series_id")
            .notNullable()
            .references("id")
            .inTable("kalshi_series")
            .withKeyName("fk_kalshi_markets_kalshi_series");
        table.text("event_ticker").notNullable();
        table.text("title").notNullable();
        table.text("yes_sub_title").notNullable();
        table.text("status").notNullable();
        table.timestamp("close_time", { useTz: true }).notNullable();
        table.text("rules_primary").notNullable();
        table.text("rules_secondary").notNullable().defaultTo("");
        table.bigInteger("volume_24h").notNullable().defaultTo(0);
        table.bigInteger("open_interest").notNullable().defaultTo(0);
        table.timestamp("source_updated_at", { useTz: true }).nullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("kalshi_markets", (table) => {
        table.index("kalshi_series_id", "idx_kalshi_markets_kalshi_series_id");
        table.index("status", "idx_kalshi_markets_status");
        table.index("close_time", "idx_kalshi_markets_close_time");
    });

    await knex.schema.createTable("trade_proposals", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("ingested_post_id")
            .notNullable()
            .references("id")
            .inTable("ingested_posts")
            .withKeyName("fk_trade_proposals_ingested_posts");
        table.text("topic").notNullable();
        table.text("direction").notNullable();
        table.decimal("confidence", null).notNullable();
        table.text("action").notNullable();
        table.text("ticker").nullable();
        table.text("outcome_side").nullable();
        table.decimal("fair_probability", null).nullable();
        table.decimal("conviction", null).notNullable();
        table.integer("horizon_model_minutes").nullable();
        table.text("no_trade_reason").nullable();
        table.text("veto_reason").nullable();
        table.text("status").notNullable();
        table.text("reasoning").notNullable();
        table.jsonb("candidate_tickers").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.jsonb("inspected_tickers").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.jsonb("rejected_candidates").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("trade_proposals", (table) => {
        table.index("ingested_post_id", "idx_trade_proposals_ingested_post_id");
        table.index("status", "idx_trade_proposals_status");
    });

    await knex.schema.createTable("orders", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("trade_proposal_id")
            .notNullable()
            .references("id")
            .inTable("trade_proposals")
            .withKeyName("fk_orders_trade_proposals");
        table.text("client_order_id").notNullable().unique();
        table.text("kalshi_order_id").nullable();
        table.text("ticker").notNullable();
        table.text("outcome_side").notNullable();
        table.integer("limit_price_cents").notNullable();
        table.integer("contracts").notNullable();
        table.text("status").notNullable();
        table.boolean("is_dry_run").notNullable().defaultTo(true);
        table.bigInteger("ts_ms").nullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("orders", (table) => {
        table.index("trade_proposal_id", "idx_orders_trade_proposal_id");
    });

    await knex.schema.createTable("positions", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table.uuid("order_id").notNullable().references("id").inTable("orders").withKeyName("fk_positions_orders");
        table
            .uuid("trade_proposal_id")
            .notNullable()
            .references("id")
            .inTable("trade_proposals")
            .withKeyName("fk_positions_trade_proposals");
        table.text("topic").notNullable();
        table.text("ticker").notNullable();
        table.text("outcome_side").notNullable();
        table.integer("contracts").notNullable();
        table.integer("entry_fill_cents").notNullable();
        table.integer("entry_fee_cents").notNullable();
        table.timestamp("deadline_at", { useTz: true }).notNullable();
        table.integer("stop_price_cents").nullable();
        table.integer("target_price_cents").notNullable();
        table.text("horizon_source").notNullable();
        table.integer("horizon_model_minutes").nullable();
        table.integer("horizon_deterministic_minutes").nullable();
        table.integer("atr_cents").nullable();
        table.timestamp("opened_at", { useTz: true }).notNullable();
        table.timestamp("closed_at", { useTz: true }).nullable();
        table.text("exit_reason").nullable();
        table.integer("exit_price_cents").nullable();
        table.integer("peak_favourable_cents").nullable();
        table.integer("realized_pnl_cents").nullable();
        table.boolean("is_dry_run").notNullable().defaultTo(true);
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.schema.alterTable("positions", (table) => {
        table.index("order_id", "idx_positions_order_id");
        table.index("trade_proposal_id", "idx_positions_trade_proposal_id");
        table.index("topic", "idx_positions_topic");
        table.index("deadline_at", "idx_positions_deadline_at");
        table.index("closed_at", "idx_positions_closed_at");
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists("positions");
    await knex.schema.dropTableIfExists("orders");
    await knex.schema.dropTableIfExists("trade_proposals");
    await knex.schema.dropTableIfExists("kalshi_markets");
    await knex.schema.dropTableIfExists("kalshi_series");
    await knex.schema.dropTableIfExists("topic_market_map");
}
