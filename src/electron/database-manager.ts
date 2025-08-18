import { WebContents, ipcMain } from "electron";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Db, MongoClient, ObjectId, UpdateResult } from "mongodb";

export interface DatabaseConfig {
  dbPath: string;
  port: number;
}

export interface Model {
  id: string;
  [key: string]: any;
}

export class ElectronDatabaseManager {
  private webContents: WebContents;
  private mongod: MongoMemoryReplSet | undefined;
  private client: MongoClient | undefined;
  private db: Db | undefined;

  constructor(webContents: WebContents) {
    this.webContents = webContents;

    ipcMain.on(
      "data:create",
      async (_event, type: string, data: Omit<Model, "id">) => {
        this.webContents.send("data:add", type, await this.create(type, data));
      }
    );

    ipcMain.on("data:find", async (_event, type: string, id: string) => {
      this.webContents.send("data:add", id, type, await this.find(type, id));
    });

    ipcMain.on(
      "data:findByQuery",
      async (_event, type: string, query: string) => {
        this.webContents.send(
          "data:add",
          type,
          await this.findByQuery(type, query)
        );
      }
    );

    ipcMain.on("data:update", async (_event, type: string, data: Model) => {
      this.webContents.send(
        "data:update",
        type,
        data.id,
        await this.update(type, data)
      );
    });

    ipcMain.on("data:delete", async (_event, type: string, id: string) => {
      this.webContents.send(
        "data:delete",
        type,
        id,
        await this.delete(type, id)
      );
    });
  }

  public async start(config: DatabaseConfig) {
    this.webContents.send("databaseConnection", { status: "Starting" });

    let uri: string | undefined;

    try {
      this.mongod = await MongoMemoryReplSet.create({
        instanceOpts: [
          {
            port: config.port,
            dbPath: config.dbPath,
            storageEngine: "wiredTiger",
          },
        ],
        replSet: { count: 1 },
      });

      uri = this.mongod.getUri();

      this.client = new MongoClient(uri);
      await this.client.connect();

      this.db = this.client.db("ham-delux");

      this.webContents.send("databaseConnection", { status: "Running", uri });
    } catch (error) {
      this.webContents.send("databaseConnection", { status: "Failed", error });
    }
  }

  public async create(
    type: string,
    data: Omit<Model, "id">
  ): Promise<Model | undefined> {
    const result = await this.db?.collection(type).insertOne(data);

    if (result == undefined) {
      return undefined;
    }

    return { id: result.insertedId.toHexString(), ...data };
  }

  public async find(
    type: string,
    id: string
  ): Promise<Model | null | undefined> {
    return await this.db
      ?.collection(type)
      .findOne<Model>({ _id: new ObjectId(id) });
  }

  public async findByQuery(type: string, query: any): Promise<Model[]> {
    const cursor = await this.db?.collection("radios").find(query);

    const items: Model[] = [];

    while (cursor?.hasNext()) {
      const data = (await cursor.next()) as any;

      if (data != null) {
        const id = data._id.toHexString();
        delete data._id;
        items.push({ id, ...data });
      }
    }

    return items;
  }

  public async update(type: string, data: Model): Promise<boolean> {
    const result = (await this.db
      ?.collection(type)
      .replaceOne({ _id: new ObjectId(data.id) }, data)) as UpdateResult;
    return result.matchedCount == 1;
  }

  public async delete(type: string, id: string): Promise<boolean> {
    const result = await this.db
      ?.collection(type)
      .deleteOne({ _id: new ObjectId(id) });
    return result?.deletedCount == 1;
  }

  public async stop() {
    this.webContents.send("databaseConnection", { status: "Stopping" });

    try {
      if (this.client != undefined) {
        await this.client.close();
      }
    } catch {
      // do nothing
    }

    try {
      if (this.mongod != undefined) {
        await this.mongod.stop();
      }
    } catch {
      // do nothing
    }

    this.webContents.send("databaseConnection", { status: "Stopped" });
  }
}
