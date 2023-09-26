import React, { useEffect, useState } from "react";

export type APICardProps = {
  object: string;
  id: string;
  oracle_id: string;
  multiverse_ids: number[];
  tcgplayer_id: number;
  cardmarket_id: number;
  name: string;
  lang: string;
  released_at: string;
  uri: string;
  scryfall_uri: string;
  layout: string;
  highres_image: boolean;
  image_status: string;
  image_uris: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
  };
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  power: string;
  toughness: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  legalities: {
    standard: string;
    future: string;
    historic: string;
    gladiator: string;
    pioneer: string;
    explorer: string;
    modern: string;
    legacy: string;
    pauper: string;
    vintage: string;
    penny: string;
    commander: string;
    oathbreaker: string;
    brawl: string;
    historicbrawl: string;
    alchemy: string;
    paupercommander: string;
    duel: string;
    oldschool: string;
    premodern: string;
    predh: string;
  };
  games: string[];
  reserved: boolean;
  foil: boolean;
  nonfoil: boolean;
  finishes: string[];
  oversized: boolean;
  promo: boolean;
  reprint: boolean;
  variation: boolean;
  card_faces: {
    object: string;
    name: string;
    mana_cost: string;
    type_line: string;
    oracle_text: string;
    colors: string[];
    power: string;
    toughness: string;
    flavor_text: string;
    artist: string;
    artist_id: string;
    illustration_id: string;
    image_uris: {
      small: string;
      normal: string;
      large: string;
      png: string;
      art_crop: string;
      border_crop: string;
    };
  }[];
  set_id: string;
  set: string;
  set_name: string;
  set_type: string;
  set_uri: string;
  set_search_uri: string;
  scryfall_set_uri: string;
  rulings_uri: string;
  prints_search_uri: string;
  collector_number: string;
  digital: boolean;
  rarity: string;
  flavor_text: string;
  card_back_id: string;
  artist: string;
  artist_ids: string[];
  illustration_id: string;
  border_color: string;
  frame: string;
  full_art: boolean;
  textless: boolean;
  booster: boolean;
  story_spotlight: boolean;
  promo_types: string[];
  edhrec_rank: number;
  prices: {
    usd: string;
    usd_foil: string;
    usd_etched: string;
    eur: string;
    eur_foil: string;
    tix: string;
  };
  related_uris: {
    gatherer: string;
    tcgplayer_infinite_articles: string;
    tcgplayer_infinite_decks: string;
    edhrec: string;
    mtgtop8: string;
  };
  purchase_uris: {
    tcgplayer: string;
    cardmarket: string;
    cardhoarder: string;
  };
}

export type GameCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  key: string;
  scryfall_uri: string;
};

export async function fetchRandomCard(): Promise<GameCardProps> {
  try {
    const response = await fetch("https://api.scryfall.com/cards/random");
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();

    // Format the randomCard data into GameCardProps
    const formatted: GameCardProps = {
      title: data.name,
      description: data.oracle_text,
      imageSrc: data.image_uris?.art_crop || data.card_faces[0].image_uris?.art_crop || "",
      imageAlt: data.name,
      key: data.tcgplayer_id + "",
      scryfall_uri: data.scryfall_uri,
    };

    return formatted;
  } catch (error) {
    console.error("Error fetching random card:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}
