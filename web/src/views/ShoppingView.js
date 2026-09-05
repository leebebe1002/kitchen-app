const { ref, computed } = Vue;

export default {
    props: ['engine'],
    setup(props) {
        const engine = props.engine;

        const shoppingStoreFilter = ref('all');
        const activeStorePickerItemId = ref(null);
        const lastStoreAction = ref(null);

        const availableStores = ['全聯', 'Costco', '義美', 'EC 電商', '傳統市場', '其他'];

        const shoppingList = computed(() => {
            return engine?.data?.pantryInventory?.shoppingList || [];
        });

        const foodShoppingItems = computed(() => {
            return shoppingList.value.filter(item => item.type !== 'supply');
        });

        const supplyShoppingItems = computed(() => {
            return shoppingList.value.filter(item => item.type === 'supply');
        });

        const getItemStores = (item) => {
            if (item.store) return [item.store];
            if (Array.isArray(item.preferredStores) && item.preferredStores.length > 0) return item.preferredStores;
            if (item.preferredStore) return item.preferredStore.split('/').map(s => s.trim()).filter(Boolean);
            return ['全聯'];
        };

        const getItemStoreLabel = (item) => {
            const stores = getItemStores(item);
            return stores.length > 0 ? stores.join(' / ') : '未指定';
        };

        const filteredFoodShopping = computed(() => {
            const list = foodShoppingItems.value;
            if (shoppingStoreFilter.value === 'all') return list;
            return list.filter(item => {
                const stores = getItemStores(item);
                return stores.includes(shoppingStoreFilter.value);
            });
        });

        const filteredSupplyShopping = computed(() => {
            const list = supplyShoppingItems.value;
            if (shoppingStoreFilter.value === 'all') return list;
            return list.filter(item => {
                const stores = getItemStores(item);
                return stores.includes(shoppingStoreFilter.value);
            });
        });

        const getStoreShoppingCount = (store) => {
            if (store === 'all') {
                return shoppingList.value.length;
            }
            return shoppingList.value.filter(item => {
                const stores = getItemStores(item);
                return stores.includes(store);
            }).length;
        };

        const toggleItemPurchased = async (id) => {
            if (engine?.toggleShoppingItemPurchased) {
                await engine.toggleShoppingItemPurchased(id);
            }
        };

        const deleteShoppingItem = async (id) => {
            if (confirm('確定要從採買清單移除此項目嗎？') && engine?.deleteShoppingItem) {
                await engine.deleteShoppingItem(id);
            }
        };

        const toggleStorePicker = (itemId) => {
            if (activeStorePickerItemId.value === itemId) {
                activeStorePickerItemId.value = null;
            } else {
                activeStorePickerItemId.value = itemId;
            }
        };

        const toggleStoreForItem = async (item, store) => {
            const currentStores = getItemStores(item);
            let updatedStores = [];
            if (currentStores.includes(store)) {
                if (currentStores.length === 1) {
                    alert(`【${item.name}】至少需保留一個採買通路！`);
                    return;
                }
                updatedStores = currentStores.filter(s => s !== store);
            } else {
                updatedStores = [...currentStores, store];
            }

            const previousStores = [...currentStores];
            const updatedLabel = updatedStores.join(' / ');

            if (item.type === 'supply') {
                item.store = updatedStores[0];
            } else {
                item.preferredStores = updatedStores;
                item.preferredStore = updatedLabel;
                const ingInMaster = (engine.data.ingredients || []).find(i => i.id === item.targetId);
                if (ingInMaster) {
                    ingInMaster.preferredStores = updatedStores;
                    ingInMaster.preferredStore = updatedLabel;
                }
            }
            await engine.saveJson('pantry_inventory.json', engine.data.pantryInventory);

            lastStoreAction.value = {
                itemId: item.id,
                itemName: item.name,
                itemType: item.type,
                previousStores,
                newStoreLabel: updatedLabel
            };
        };

        const undoLastStoreAction = async () => {
            if (!lastStoreAction.value) return;
            const action = lastStoreAction.value;
            const item = (engine.data.pantryInventory?.shoppingList || []).find(it => it.id === action.itemId);
            if (item) {
                const revertedStores = action.previousStores;
                const revertedLabel = revertedStores.join(' / ');
                if (item.type === 'supply') {
                    item.store = revertedStores[0];
                } else {
                    item.preferredStores = revertedStores;
                    item.preferredStore = revertedLabel;
                    const ingInMaster = (engine.data.ingredients || []).find(i => i.id === item.targetId);
                    if (ingInMaster) {
                        ingInMaster.preferredStores = revertedStores;
                        ingInMaster.preferredStore = revertedLabel;
                    }
                }
                await engine.saveJson('pantry_inventory.json', engine.data.pantryInventory);
            }
            lastStoreAction.value = null;
        };

        const clearPurchased = async () => {
            const purchasedCount = (engine.data.pantryInventory?.shoppingList || []).filter(it => it.isPurchased).length;
            if (purchasedCount === 0) {
                alert('目前沒有已勾選購買的項目！請先勾選已買到的食材。');
                return;
            }
            if (confirm(`確定要清除這 ${purchasedCount} 項已買到的食材，並自動恢復庫存嗎？`)) {
                await engine.clearPurchasedShoppingList();
                alert(`🎉 已成功清除 ${purchasedCount} 個品項並恢復為有庫存！`);
            }
        };

        const copyShoppingListText = () => {
            const list = shoppingList.value;
            if (list.length === 0) {
                alert('目前沒有待採買清單！');
                return;
            }

            const currentFilter = shoppingStoreFilter.value;
            const itemsToCopy = (currentFilter === 'all')
                ? list
                : list.filter(item => getItemStores(item).includes(currentFilter));

            if (itemsToCopy.length === 0) {
                alert(`【${currentFilter}】目前沒有待買項目！`);
                return;
            }

            const storeTitle = currentFilter === 'all' ? '全部賣場' : currentFilter;
            let text = `🛒 【Family Kitchen 採買清單 - ${storeTitle}】\n`;

            const unpurchased = itemsToCopy.filter(it => !it.isPurchased);
            const purchased = itemsToCopy.filter(it => it.isPurchased);

            if (unpurchased.length > 0) {
                text += `\n📌 待買項目 (${unpurchased.length})：\n`;
                unpurchased.forEach(it => {
                    const storeStr = currentFilter === 'all' ? ` [${getItemStoreLabel(it)}]` : '';
                    text += `▫️ ${it.name}${storeStr}\n`;
                });
            }

            if (purchased.length > 0) {
                text += `\n✅ 已買到 (${purchased.length})：\n`;
                purchased.forEach(it => {
                    text += `▪️ ~${it.name}~\n`;
                });
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    alert(`📋 清單文字已成功複製！可直接貼到 LINE 中。`);
                }).catch(err => {
                    prompt('複製失敗，請長按下方框手動複製：', text);
                });
            } else {
                prompt('請手動複製採買清單：', text);
            }
        };

        return {
            shoppingStoreFilter,
            activeStorePickerItemId,
            lastStoreAction,
            availableStores,
            shoppingList,
            foodShoppingItems,
            supplyShoppingItems,
            filteredFoodShopping,
            filteredSupplyShopping,
            getStoreShoppingCount,
            getItemStoreLabel,
            getItemStores,
            toggleItemPurchased,
            deleteShoppingItem,
            toggleStorePicker,
            toggleStoreForItem,
            undoLastStoreAction,
            clearPurchased,
            copyShoppingListText
        };
    },
    template: `
        <div class="view-shopping card" style="background: #FFFFFF; border: 1px solid var(--color-border); border-radius: 20px; padding: 20px 18px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
            <!-- Top Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 1.15rem; color: var(--color-text-main);">
                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M2 3h3.5l2.4 11.5a1.8 1.8 0 0 0 1.8 1.5h9.5a1.8 1.8 0 0 0 1.8-1.5L22.5 7H6"></path>
                        <circle cx="9.5" cy="20" r="1.4"></circle>
                        <circle cx="18.5" cy="20" r="1.4"></circle>
                    </svg>
                    <span>賣場待採買 CheckList</span>
                </div>
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--color-text-muted); background: #FAF8F5; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--color-border);">
                    共 {{ shoppingList.length }} 項
                </div>
            </div>

            <!-- 1. 🏬 賣場過濾 Filter 膠囊 -->
            <div style="display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap;">
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'all' }" @click="shoppingStoreFilter = 'all'">
                    全部 ({{ getStoreShoppingCount('all') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '全聯' }" @click="shoppingStoreFilter = '全聯'">
                    全聯 ({{ getStoreShoppingCount('全聯') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'Costco' }" @click="shoppingStoreFilter = 'Costco'">
                    Costco ({{ getStoreShoppingCount('Costco') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '義美' }" @click="shoppingStoreFilter = '義美'">
                    義美 ({{ getStoreShoppingCount('義美') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === 'EC 電商' }" @click="shoppingStoreFilter = 'EC 電商'">
                    EC 電商 ({{ getStoreShoppingCount('EC 電商') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '傳統市場' }" @click="shoppingStoreFilter = '傳統市場'">
                    傳統市場 ({{ getStoreShoppingCount('傳統市場') }})
                </button>
                <button class="capsule" :class="{ 'selected': shoppingStoreFilter === '其他' }" @click="shoppingStoreFilter = '其他'">
                    其他 ({{ getStoreShoppingCount('其他') }})
                </button>
            </div>

            <!-- Empty State -->
            <div v-if="filteredFoodShopping.length === 0 && filteredSupplyShopping.length === 0" 
                 style="text-align: center; padding: 48px 16px; color: var(--color-text-muted); background: #FAF8F5; border-radius: 16px; border: 1px dashed var(--color-border);">
                <div style="font-size: 2rem; margin-bottom: 10px;">🧺</div>
                <div style="font-weight: 600; color: var(--color-text-main); margin-bottom: 4px;">
                    目前在【{{ shoppingStoreFilter === 'all' ? '全部賣場' : shoppingStoreFilter }}】沒有待買項目！
                </div>
                <span style="font-size: 0.8rem; color: #9CA3AF;">
                    在備料計算器或智慧冰箱中點擊缺庫存食材 🛒 即可加入此清單。
                </span>
            </div>

            <div v-else style="margin-bottom: 24px;">
                <!-- 全域通路變更 ＆ 復原通知條 -->
                <div v-if="lastStoreAction" 
                     style="display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; margin-bottom: 14px; background: #FEF3C7; border: 1.5px solid #FDE68A; border-radius: 10px; font-size: 0.82rem; color: #92400E; box-shadow: 0 2px 8px rgba(0,0,0,0.04); gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#D97706" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span style="line-height: 1.35; overflow: hidden; text-overflow: ellipsis;">
                            <b>【{{ lastStoreAction.itemName }}】</b>通路已改為【{{ lastStoreAction.newStoreLabel }}】
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <button class="btn-icon" @click.stop="undoLastStoreAction" 
                                style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 0.78rem; font-weight: 700; background: #FFFFFF; border: 1.2px solid #F59E0B; border-radius: 6px; color: #B45309; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                            </svg>
                            <span>立即復原</span>
                        </button>
                        <button class="btn-icon" @click="lastStoreAction = null" 
                                title="關閉提示"
                                style="width: 22px; height: 22px; padding: 0; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: #B45309; cursor: pointer; border-radius: 4px;">
                            ✕
                        </button>
                    </div>
                </div>

                <!-- 【食材類】 -->
                <div v-if="filteredFoodShopping.length > 0" style="margin-bottom: 18px;">
                    <div style="font-size: 0.88rem; font-weight: 700; margin-bottom: 10px; color: var(--color-text-main); display: flex; align-items: center; gap: 6px;">
                        <span>🥗 食材品項 ({{ filteredFoodShopping.length }})</span>
                    </div>
                    <div v-for="item in filteredFoodShopping" :key="item.id" style="margin-bottom: 8px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FAF8F5; border-radius: 12px; border: 1px solid var(--color-border);">
                                <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" @click="toggleItemPurchased(item.id)">
                                    <input type="checkbox" :checked="item.isPurchased" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-primary);">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span :style="{ textDecoration: item.isPurchased ? 'line-through' : 'none', color: item.isPurchased ? '#9CA3AF' : 'var(--color-text-main)', fontWeight: 600 }">
                                            {{ item.name }}
                                        </span>
                                        <span v-if="shoppingStoreFilter === 'all'" style="font-size: 0.72rem; color: #4B5563; background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                                            {{ getItemStoreLabel(item) }}
                                        </span>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <button class="btn-icon" @click.stop="toggleStorePicker(item.id)" 
                                            :title="'設定通路：' + getItemStoreLabel(item) + '（支援複選）'" 
                                            :style="{
                                                width: '32px',
                                                height: '32px',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: activeStorePickerItemId === item.id ? 'var(--color-primary)' : 'var(--color-text-main)',
                                                cursor: 'pointer'
                                            }">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 3h18v6H3z"></path>
                                            <path d="M3 9c1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0"></path>
                                            <path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"></path>
                                            <path d="M10 22v-6h4v6"></path>
                                        </svg>
                                    </button>
                                    <button class="btn-icon" @click="deleteShoppingItem(item.id)" title="刪除項目" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #EF4444; cursor: pointer; border-radius: 8px;">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            <line x1="10" y1="11" x2="10" y2="17"></line>
                                            <line x1="14" y1="11" x2="14" y2="17"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            
                            <!-- 點擊展開的複選通路選擇列 -->
                            <div v-if="activeStorePickerItemId === item.id" style="background: #FFFFFF; border: 1.5px solid var(--color-primary); border-radius: 10px; padding: 10px 12px; margin-top: 4px; margin-bottom: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                                <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                                    <span>📍 勾選採買通路（支援複選，跨店同步）：</span>
                                    <span style="cursor: pointer; color: #9CA3AF; padding: 0 4px;" @click="activeStorePickerItemId = null">✕ 關閉</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                    <button v-for="store in availableStores" :key="store"
                                            class="btn-icon"
                                            :style="{
                                                padding: '5px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                fontWeight: '600',
                                                background: getItemStores(item).includes(store) ? 'var(--color-primary)' : '#F3F4F6',
                                                color: getItemStores(item).includes(store) ? '#FFFFFF' : '#374151',
                                                border: getItemStores(item).includes(store) ? '1px solid var(--color-primary)' : '1px solid #E5E7EB',
                                                cursor: 'pointer'
                                            }"
                                            @click="toggleStoreForItem(item, store)">
                                        <span v-if="getItemStores(item).includes(store)">✓ </span>{{ store }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 【生活雜項類】 -->
                <div v-if="filteredSupplyShopping.length > 0">
                    <div style="font-size: 0.88rem; font-weight: 700; margin-bottom: 10px; color: var(--color-text-main); display: flex; align-items: center; gap: 6px;">
                        <span>📦 生活耗材與調料 ({{ filteredSupplyShopping.length }})</span>
                    </div>
                    <div v-for="item in filteredSupplyShopping" :key="item.id" style="margin-bottom: 8px;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #FAF8F5; border-radius: 12px; border: 1px solid var(--color-border);">
                                <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" @click="toggleItemPurchased(item.id)">
                                    <input type="checkbox" :checked="item.isPurchased" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--color-primary);">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span :style="{ textDecoration: item.isPurchased ? 'line-through' : 'none', color: item.isPurchased ? '#9CA3AF' : 'var(--color-text-main)', fontWeight: 600 }">
                                            {{ item.name }}
                                        </span>
                                        <span v-if="shoppingStoreFilter === 'all'" style="font-size: 0.72rem; color: #4B5563; background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                                            {{ getItemStoreLabel(item) }}
                                        </span>
                                    </div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <button class="btn-icon" @click.stop="toggleStorePicker(item.id)" 
                                            :title="'設定通路：' + getItemStoreLabel(item) + '（支援複選）'" 
                                            :style="{
                                                width: '32px',
                                                height: '32px',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: 'transparent',
                                                color: activeStorePickerItemId === item.id ? 'var(--color-primary)' : 'var(--color-text-main)',
                                                cursor: 'pointer'
                                            }">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M3 3h18v6H3z"></path>
                                            <path d="M3 9c1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0 1.5 2 4.5 2 6 0"></path>
                                            <path d="M5 11v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9"></path>
                                            <path d="M10 22v-6h4v6"></path>
                                        </svg>
                                    </button>
                                    <button class="btn-icon" @click="deleteShoppingItem(item.id)" title="刪除項目" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #EF4444; cursor: pointer; border-radius: 8px;">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            <line x1="10" y1="11" x2="10" y2="17"></line>
                                            <line x1="14" y1="11" x2="14" y2="17"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            
                            <!-- 點擊展開的複選通路選擇列 -->
                            <div v-if="activeStorePickerItemId === item.id" style="background: #FFFFFF; border: 1.5px solid var(--color-primary); border-radius: 10px; padding: 10px 12px; margin-top: 4px; margin-bottom: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                                <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 8px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                                    <span>📍 勾選採買通路（支援複選，跨店同步）：</span>
                                    <span style="cursor: pointer; color: #9CA3AF; padding: 0 4px;" @click="activeStorePickerItemId = null">✕ 關閉</span>
                                </div>
                                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                    <button v-for="store in availableStores" :key="store"
                                            class="btn-icon"
                                            :style="{
                                                padding: '5px 12px',
                                                borderRadius: '8px',
                                                fontSize: '0.8rem',
                                                fontWeight: '600',
                                                background: getItemStores(item).includes(store) ? 'var(--color-primary)' : '#F3F4F6',
                                                color: getItemStores(item).includes(store) ? '#FFFFFF' : '#374151',
                                                border: getItemStores(item).includes(store) ? '1px solid var(--color-primary)' : '1px solid #E5E7EB',
                                                cursor: 'pointer'
                                            }"
                                            @click="toggleStoreForItem(item, store)">
                                        <span v-if="getItemStores(item).includes(store)">✓ </span>{{ store }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. 底部快捷按鈕 (清除已買食材 & 複製清單) -->
            <div style="display: flex; gap: 10px; justify-content: space-between; border-top: 1px solid var(--color-border); padding-top: 16px;">
                <button class="btn-icon" @click="clearPurchased" style="flex: 1; padding: 12px; font-weight: 700; color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; box-shadow: 0 2px 5px rgba(4, 120, 87, 0.08); cursor: pointer;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 3l-8 8"></path>
                        <path d="M11 11l-3 7a2 2 0 0 0 2 2l7-3-6-6z"></path>
                    </svg>
                    <span>清除已買食材</span>
                </button>
                <button class="btn-primary accent" @click="copyShoppingListText" style="flex: 1; justify-content: center; padding: 12px; font-weight: 700; font-size: 0.95rem; border-radius: 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(237, 137, 54, 0.25); cursor: pointer;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>複製清單至 LINE</span>
                </button>
            </div>
        </div>
    `
};
