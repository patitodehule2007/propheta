import type { Knex } from "knex";

// Kalshi's fixed-point counts (`volume_24h_fp`, `open_interest_fp`, series
// volume) can be fractional, e.g. "2.01" -- BIGINT rejects them.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable("kalshi_series", (table) => {
        table.decimal("volume", null).notNullable().defaultTo(0).alter();
    });

    await knex.schema.alterTable("kalshi_markets", (table) => {
        table.decimal("volume_24h", null).notNullable().defaultTo(0).alter();
        table.decimal("open_interest", null).notNullable().defaultTo(0).alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable("kalshi_markets", (table) => {
        table.bigInteger("volume_24h").notNullable().defaultTo(0).alter();
        table.bigInteger("open_interest").notNullable().defaultTo(0).alter();
    });

    await knex.schema.alterTable("kalshi_series", (table) => {
        table.bigInteger("volume").notNullable().defaultTo(0).alter();
    });
}
