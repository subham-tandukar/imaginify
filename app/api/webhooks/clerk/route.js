import { clerkClient } from "@clerk/nextjs";
import { Webhook } from "svix";
import { NextResponse } from "next/server";

import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";

export default async function handler(req, res) {
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ error: "WEBHOOK_SECRET is not set" });
  }

  const { svixId, svixTimestamp, svixSignature } = req.headers;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).json({ error: "Missing required headers" });
  }

  const payload = await req.json();

  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;

  try {
    evt = wh.verify(JSON.stringify(payload), {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).json({ error: "Failed to verify webhook" });
  }

  const { id, type } = evt.data;

  if (type === "user.created") {
    const { email_addresses, image_url, first_name, last_name, username } =
      evt.data;

    const user = {
      clerkId: id,
      email: email_addresses[0].email_address,
      username: username || "",
      firstName: first_name,
      lastName: last_name,
      photo: image_url,
    };

    try {
      const newUser = await createUser(user);

      if (newUser) {
        await clerkClient.users.updateUserMetadata(id, {
          publicMetadata: {
            userId: newUser._id,
          },
        });
      }

      return res.status(200).json({ message: "OK", user: newUser });
    } catch (error) {
      console.error("Error creating user:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }
  } else if (type === "user.updated") {
    const { image_url, first_name, last_name, username } = evt.data;

    const user = {
      firstName: first_name,
      lastName: last_name,
      username: username || "",
      photo: image_url,
    };

    try {
      const updatedUser = await updateUser(id, user);
      return res.status(200).json({ message: "OK", user: updatedUser });
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  } else if (type === "user.deleted") {
    try {
      const deletedUser = await deleteUser(id);
      return res.status(200).json({ message: "OK", user: deletedUser });
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  }

  console.log(`Webhook with an ID of ${id} and type of ${type}`);
  console.log("Webhook body:", JSON.stringify(payload));

  return res.status(200).end();
}
