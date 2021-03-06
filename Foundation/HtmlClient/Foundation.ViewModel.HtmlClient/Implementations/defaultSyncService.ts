﻿module Foundation.ViewModel.Implementations {

    export class DefaultSyncService implements ViewModel.Contracts.ISyncService {

        private onlineContextFactory: () => Promise<$data.EntityContext>;
        private offlineContextFactory: () => Promise<$data.EntityContext>;

        @Core.Log()
        public init(onlineContextFactory: () => Promise<$data.EntityContext>, offlineContextFactory: () => Promise<$data.EntityContext>): void {
            if (onlineContextFactory == null)
                throw new Error("onlineContextFactory may not be null");
            if (offlineContextFactory == null)
                throw new Error("offlineContextFactory may not be null");
            this.offlineContextFactory = offlineContextFactory;
            this.onlineContextFactory = onlineContextFactory;
        }

        private entitySetConfigs: Array<{ entitySetName: string, getMethod?: (context: $data.EntityContext) => $data.Queryable<Model.Contracts.ISyncableDto>, syncConfig?: { fromServerSync?: boolean | (() => boolean), toServerSync?: boolean | (() => boolean) } }> = [];

        @Core.Log()
        public addEntitySetConfig<TEntityContext extends $data.EntityContext>(entitySet: $data.EntitySet<Model.Contracts.ISyncableDto>, getMethod?: (context: TEntityContext) => $data.Queryable<Model.Contracts.ISyncableDto>, syncConfig?: { fromServerSync?: boolean | (() => boolean), toServerSync?: boolean | (() => boolean) }) {

            if (entitySet == null)
                throw new Error("entitySetName may not be null");

            if (getMethod == null)
                getMethod = (cntx) => cntx[entitySet.collectionName];

            if (syncConfig == null)
                syncConfig = { fromServerSync: true, toServerSync: true };
            if (syncConfig.fromServerSync == null)
                syncConfig.fromServerSync = true;
            if (syncConfig.toServerSync == null)
                syncConfig.toServerSync = true;

            this.entitySetConfigs.push({ entitySetName: entitySet.collectionName, getMethod: getMethod, syncConfig: syncConfig });
        }

        @Core.Log()
        public async syncContext(): Promise<void> {
            await this.syncEntitySets(this.entitySetConfigs.map(entitySetConfig => { return entitySetConfig.entitySetName as any; }));
        }

        @Core.Log()
        public async syncEntitySet<TEntityContext extends $data.EntityContext>(entitySetName: keyof TEntityContext): Promise<void> {

            await this.syncEntitySets<TEntityContext>([entitySetName]);

        }

        public async syncEntitySets<TEntityContext extends $data.EntityContext>(entitySetNames: Array<keyof TEntityContext>): Promise<void> {

            if (entitySetNames == null)
                throw new Error("entitySetNames may not be null");

            if (entitySetNames.length == 0)
                throw new Error("entitySetNames may not be empty");

            if (entitySetNames.some(entitySetName => entitySetName == null))
                throw new Error("entitySetName may not be null");

            let entitySetConfigs = entitySetNames
                .map(entitySetName => { return this.entitySetConfigs.find(ec => ec.entitySetName.toLowerCase() == entitySetName.toLowerCase()); });

            if (entitySetConfigs.some(entitySetConfig => entitySetConfig == null))
                throw new Error("No entity set config found named");

            if (navigator.onLine == false)
                return;

            let onlineContext = await this.onlineContextFactory();
            let offlineContext = await this.offlineContextFactory();
            offlineContext["ignoreEntityEvents"] = true;

            let entitySetSyncMaterials = entitySetConfigs.map(entitySetConfig => {
                return {
                    entitySetConfig: entitySetConfig,
                    offlineEntitySet: offlineContext[entitySetConfig.entitySetName] as $data.EntitySet<Model.Contracts.ISyncableDto>,
                    onlineEntitySet: onlineContext[entitySetConfig.entitySetName] as $data.EntitySet<Model.Contracts.ISyncableDto>,
                    keyMembers: ((offlineContext[entitySetConfig.entitySetName] as $data.EntitySet<Model.Contracts.ISyncableDto>).elementType.memberDefinitions as any).getKeyProperties() as any[]
                };
            });

            let toServerEntitySetSyncMaterials = entitySetSyncMaterials.filter(entitySetSyncMaterial => entitySetSyncMaterial.entitySetConfig.syncConfig.toServerSync == true || (typeof entitySetSyncMaterial.entitySetConfig.syncConfig.toServerSync == "function" && entitySetSyncMaterial.entitySetConfig.syncConfig.toServerSync() == true));
            let fromServerEntitySetSyncMaterials = entitySetSyncMaterials.filter(entitySetSyncMaterial => entitySetSyncMaterial.entitySetConfig.syncConfig.fromServerSync == true || (typeof entitySetSyncMaterial.entitySetConfig.syncConfig.fromServerSync == "function" && entitySetSyncMaterial.entitySetConfig.syncConfig.fromServerSync() == true));

            if (toServerEntitySetSyncMaterials.length > 0) {

                let allRecentlyChangedOfflineEntities = await offlineContext.batchExecuteQuery(toServerEntitySetSyncMaterials.map(entitySetSyncMaterial => {
                    return entitySetSyncMaterial.offlineEntitySet.filter(e => e.ISV != true);
                }));

                for (let i = 0; i < toServerEntitySetSyncMaterials.length; i++) {

                    let entitySetSyncMaterial = toServerEntitySetSyncMaterials[i];
                    let recentlyChangedOfflineEntities = allRecentlyChangedOfflineEntities[i];

                    for (let modifiedOfflineEntity of recentlyChangedOfflineEntities) {
                        let clonedEntityToBeSavedInOnlineContext = entitySetSyncMaterial.onlineEntitySet.elementType["create"](modifiedOfflineEntity["initData"]) as Model.Contracts.ISyncableDto;
                        onlineContext.attach(clonedEntityToBeSavedInOnlineContext, $data.EntityAttachMode.AllChanged);
                        if (clonedEntityToBeSavedInOnlineContext.IsArchived == true)
                            clonedEntityToBeSavedInOnlineContext.entityState = $data.EntityState.Deleted;
                        else if (clonedEntityToBeSavedInOnlineContext.Version == null || clonedEntityToBeSavedInOnlineContext.Version == "0")
                            clonedEntityToBeSavedInOnlineContext.entityState = $data.EntityState.Added;
                        else
                            clonedEntityToBeSavedInOnlineContext.entityState = $data.EntityState.Modified;
                    }
                }

                await onlineContext.saveChanges();
            }

            if (fromServerEntitySetSyncMaterials.length > 0) {

                let allOfflineEntitiesOrderedByVersion = await offlineContext.batchExecuteQuery(fromServerEntitySetSyncMaterials.map(entitySetSyncMaterial => {
                    return entitySetSyncMaterial.offlineEntitySet.orderByDescending(e => e.Version);
                })) as Model.Contracts.ISyncableDto[][];

                let loadRecentlyChangedOnlineEntitiesQueries = fromServerEntitySetSyncMaterials.map((entitySetSyncMaterial, i) => {

                    const offlineEntitiesOrderedByVersion = allOfflineEntitiesOrderedByVersion[i];

                    let maxVersion = "0";

                    if (offlineEntitiesOrderedByVersion[0] != null)
                        maxVersion = offlineEntitiesOrderedByVersion[0].Version;

                    const recentlyChangedOnlineEntitiesQuery = entitySetSyncMaterial.entitySetConfig.getMethod(onlineContext).filter((e, ver) => e.Version > ver, { ver: maxVersion });

                    return recentlyChangedOnlineEntitiesQuery;

                });

                let allRecentlyChangedOnlineEntities = (await onlineContext.batchExecuteQuery(loadRecentlyChangedOnlineEntitiesQueries)) as Model.Contracts.ISyncableDto[][];

                for (let i = 0; i < allRecentlyChangedOnlineEntities.length; i++) {

                    let entitySetSyncMaterial = fromServerEntitySetSyncMaterials[i];
                    let recentlyChangedOnlineEntities = allRecentlyChangedOnlineEntities[i];
                    let offlineEntitiesOrderedByVersion = allOfflineEntitiesOrderedByVersion[i];

                    for (let recentlyChangedOnlineEntity of recentlyChangedOnlineEntities) {

                        let clonedEntity = entitySetSyncMaterial.offlineEntitySet.elementType["create"](recentlyChangedOnlineEntity["initData"]) as Model.Contracts.ISyncableDto;
                        clonedEntity.ISV = true;

                        offlineContext.attach(clonedEntity, $data.EntityAttachMode.AllChanged);

                        if (offlineEntitiesOrderedByVersion.some(e => entitySetSyncMaterial.keyMembers.every(key => e[key.name] == clonedEntity[key.name]))) {
                            if (clonedEntity.IsArchived == true) {
                                clonedEntity.entityState = $data.EntityState.Deleted;
                            }
                            else {
                                clonedEntity.entityState = $data.EntityState.Modified;
                            }
                        }
                        else
                            clonedEntity.entityState = $data.EntityState.Added;
                    }
                }

                await offlineContext.saveChanges();

            }
        }
    }
}