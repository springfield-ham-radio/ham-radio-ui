import { WebContents, ipcMain } from 'electron';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Db, MongoClient, ObjectId } from 'mongodb';
import { Radio } from '@springfield/ham-radio-api';

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

    ipcMain.on('data:find', (_event, type: string, id: string) => {});

    ipcMain.on('data:getRadios', async () => {
      webContents.send('data:radios', await this.getRadios());
    });

    ipcMain.on('data:addRadio', async (_event, radio: Omit<Radio, 'id'>) => {
      const newRadio = await this.addRadio(radio);

      if (newRadio != undefined) {
        this.webContents.send('data:addRadio', newRadio);
      }
    });

    ipcMain.on('data:removeRadio', async (_event, id: string) => {
      const result = await this.removeRadio(id);

      if (result) {
        this.webContents.send('data:removeRadio', id);
      }
    });
  }

  public async start(config: DatabaseConfig) {
    this.webContents.send('databaseConnection', { status: 'Starting' });

    let uri: string | undefined;

    try {
      this.mongod = await MongoMemoryReplSet.create({
        instanceOpts: [
          {
            port: config.port,
            dbPath: config.dbPath,
            storageEngine: 'wiredTiger',
          },
        ],
        replSet: { count: 1 },
      });

      uri = this.mongod.getUri();

      this.client = new MongoClient(uri);
      await this.client.connect();

      this.db = this.client.db('ham-delux');

      this.webContents.send('databaseConnection', { status: 'Running', uri });
    } catch (error) {
      this.webContents.send('databaseConnection', { status: 'Failed', error });
    }
  }

  public async create(type: string, data: Omit<Model, 'id'>): Promise<Model | undefined> {
    const result = await this.db?.collection(type).insertOne(data);

    if (result == undefined) {
      return undefined;
    }

    return { id: result.insertedId.toHexString(), ...data };
  }

  public async find(type: string, id: string): Promise<Model | null | undefined> {
    return await this.db?.collection(type).findOne<Model>({ _id: new ObjectId(id) });
  }

  public async findByQuery(type: string, query: any): Promise<Model[]> {
    const cursor = await this.db?.collection('radios').find(query);

    const items: Model[] = [];

    while (cursor?.hasNext()) {
      const data = await cursor.next();

      if (data != null) {
        const id = data._id.toHexString();
        delete data._id;
        items.push({ id, ...data });
      }
    }

    return items;
  }

  public async stop() {
    this.webContents.send('databaseConnection', { status: 'Stopping' });

    try {
      if (this.client != undefined) {
        await this.client.close();
      }
    } catch (error) {
      // do nothing
    }

    try {
      if (this.mongod != undefined) {
        await this.mongod.stop();
      }
    } catch (error) {
      // do nothing
    }

    this.webContents.send('databaseConnection', { status: 'Stopped' });
  }
}
