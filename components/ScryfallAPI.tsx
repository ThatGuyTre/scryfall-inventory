import React, { useEffect, useState } from "react";

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
      imageSrc: data.image_uris?.art_crop || "",
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
