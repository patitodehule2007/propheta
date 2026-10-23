import type { Knex } from "knex";

// Topic relevance moves from Kalshi tags to a hand-picked series whitelist:
// tags are too coarse (a single tag spans hundreds of unrelated series), so
// ranking by volume let off-topic markets crowd every relevant one out of the
// candidate cap. A join table rather than a jsonb column because one series
// can serve several topics. No foreign key to kalshi_series: the whitelist is
// seeded before the market cache has fetched any series.
//
// max_close_horizon_minutes lets a topic whose markets settle on a political
// timeline (tariffs, appointments) look further out than the global
// TRADE_HORIZON_MINUTES. NULL falls back to the global value.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable("topic_market_series", (table) => {
        table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
        table
            .uuid("topic_market_map_id")
            .notNullable()
            .references("id")
            .inTable("topic_market_map")
            .onDelete("CASCADE")
            .withKeyName("fk_topic_market_series_topic_market_map");
        table.text("series_ticker").notNullable();
        table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.unique(["topic_market_map_id", "series_ticker"], {
            indexName: "uq_topic_market_series_topic_market_map_id_series_ticker"
        });
        table.index("series_ticker", "idx_topic_market_series_series_ticker");
    });

    await knex.schema.alterTable("topic_market_map", (table) => {
        table.dropColumn("kalshi_tags");
        table.integer("max_close_horizon_minutes").nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("topic_market_map", (table) => {
        table.dropColumn("max_close_horizon_minutes");
        table.jsonb("kalshi_tags").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    });

    await knex.schema.dropTableIfExists("topic_market_series");
}
