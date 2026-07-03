import { describe, expect, it } from "vitest";
import { INITIAL_FOOD_ITEMS } from "../data/mockData";
import { isCartItemArray, isFoodItemArray, isOrder } from "./storage";

describe("storage runtime validation", () => {
  it("accepts the default menu data", () => {
    expect(isFoodItemArray(INITIAL_FOOD_ITEMS)).toBe(true);
  });

  it("rejects invalid menu prices", () => {
    const invalidMenu = [
      {
        ...INITIAL_FOOD_ITEMS[0],
        price: Number.POSITIVE_INFINITY,
      },
    ];

    expect(isFoodItemArray(invalidMenu)).toBe(false);
  });

  it("rejects cart quantities outside the supported range", () => {
    expect(
      isCartItemArray([
        {
          item: INITIAL_FOOD_ITEMS[0],
          quantity: 21,
        },
      ]),
    ).toBe(false);
  });

  it("rejects malformed orders", () => {
    expect(
      isOrder({
        id: "ord-test",
        tableId: "1abc",
        guestName: "Guest",
        items: [
          {
            itemId: INITIAL_FOOD_ITEMS[0].id,
            name: INITIAL_FOOD_ITEMS[0].name,
            price: INITIAL_FOOD_ITEMS[0].price,
            quantity: 1,
            isVeg: INITIAL_FOOD_ITEMS[0].isVeg,
          },
        ],
        subtotal: INITIAL_FOOD_ITEMS[0].price,
        tax: 9,
        serviceCharge: 20,
        grandTotal: INITIAL_FOOD_ITEMS[0].price + 29,
        status: "placed",
        placedAt: "not-a-date",
      }),
    ).toBe(false);
  });
});
