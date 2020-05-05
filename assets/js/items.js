jQuery.fn.firstAncestorOrSelf = function(func) {
  'use strict';
  if (this.length !== 1) throw new TypeError('Not implemented (yet?) for selection length != 1.');
  let node = this[0];
  while (node) {
    if (func(node)) return this.pushStack([node]);
    node = node.parentNode;
  }
}
jQuery.fn.propSearchUp = function(property) {
  'use strict';
  const element = this.firstAncestorOrSelf(element => element[property]);
  return element && element.prop(property);
}

class Collection {
  constructor(preliminary) {
    Object.assign(this, preliminary);
    this.items = []; // filled by new Item()s
    this._insertMenuElement();
  }
  static init(collections) {
    this._installEventHandlers();
    this.collections = Object.create(null);
    Object.entries(collections).forEach(([category, price]) =>
      this.collections[category] = new Collection({category, price}));
    return Loader.promises['weekly'].consumeJson(data => {
      const nameViaParam = getParameterByName('weekly');
      this.weeklySetName = data.sets[nameViaParam] ? nameViaParam : data.current;
      this.weeklyItems = data.sets[this.weeklySetName];
      console.info('%c[Weekly Set] Loaded!', 'color: #bada55; background: #242424');
    });
  }
  static updateMenu() {
    Object.values(this.collections).forEach(collection => collection.updateMenu());
  }
  static _installEventHandlers() {
    $('.side-menu')
      .on('change', event => {
        const $input = $(event.target);
        const collection = $input.propSearchUp('rdoCollection');
        if (collection && $input.hasClass('input-cycle')) {
          Cycles.categories[collection.category] = +$input.val();
          MapBase.addMarkers();
          Menu.refreshMenu();
        }
      })[0].addEventListener('click', event => {
        if (event.target.classList.contains('input-cycle')) event.stopImmediatePropagation();
      }, {capture: true});
  }
  _insertMenuElement() {
    const $elements = $(`
      <div>
        <div class="menu-option clickable" data-type="${this.category}" data-help="item_category">
          <span>
            <img class="icon" src="assets/images/icons/${this.category}.png" alt="${this.category}">
            <span>
              <span class="menu-option-text" data-text="menu.${this.category}"></span>
              <img class="same-cycle-warning-menu" src="assets/images/same-cycle-alert.png">
            </span>
          </span>
          <input class="input-text input-cycle" type="number" min="1" max="6"
            name="${this.category}" data-help="item_manual_cycle">
          <img class="cycle-icon" src="assets/images/cycle_1.png" alt="Cycle 1"
            data-type="${this.category}">
          <div class="open-submenu"></div>
        </div>
        <div class="menu-hidden" data-type="${this.category}">
          <div class="collection-value">
            <span class="collection-collected" data-help="collection_collected"></span>
            <span data-help="item_value">$${this.price}</span>
            <span class="collection-reset" data-text="menu.reset" data-help="item_reset">Reset</span>
            <span class="collection-sell" data-text="menu.sell" data-help="item_sell">Sell</span>
          </div>
          <div class="collection-value-bottom hidden">
            <span class="disable-collected-items" data-text="menu.disable_collected_items" data-help="disable_collected_items">Disable collected</span>
            <span class="collection-collect-all" data-text="menu.collection_collect_all" data-help="collection_collect_all">Collect all</span>
          </div>
        </div>
      </div>
    `).translate().insertBefore('#collection-insertion-before-point').children();
    this.$menuButton = $elements.eq(0);
    this.$submenu = $elements.eq(1);
    this.$menuButton[0].rdoCollection = this;
    this.$menuButton
      .find('.same-cycle-warning-menu').hide().end()
      .find('.input-cycle').toggleClass('hidden', !Settings.isCycleInputEnabled).end()
      .find('.cycle-icon').toggleClass('hidden', Settings.isCycleInputEnabled).end()
  }
  updateMenu () {
    const buggy = this.items.map(item => item.updateMenu()).includes(true);
    const isSameCycle = Cycles.isSameAsYesterday(this.category);
    this.$menuButton
      .attr('data-help', () => {
        if (isSameCycle) {
          return 'item_category_same_cycle';
        } else if (buggy) {
          return 'item_category_unavailable_items';
        } else {
          return 'item_category';
        }
      })
      .toggleClass('not-found', buggy)
      .find('.same-cycle-warning-menu')
        .toggle(isSameCycle)
      .end()
    this.$submenu
      .find('.collection-collected').text(Language.get('menu.collection_counter')
        .replace('{count}', this.$submenu.find('.disabled').length)
        .replace('{max}', this.items.length)
      )
    if (Settings.sortItemsAlphabetically &&
      !['cups', 'swords', 'wands', 'pentacles'].includes(this.category)) {
        this.$submenu.children('.collectible-wrapper').sort((a, b) =>
          a.innerText.localeCompare(b.innerText, Settings.language, {sensitivity: 'base'}))
          .appendTo(this.$submenu);
    }
  }
  averageAmount() {
    return this.items.reduce((sum, item) => sum + item.amount, 0) / this.items.length;
  }
  effectiveAmount() {
    return Math.min(...this.items.map(item => item.effectiveAmount()));
  }
  totalValue() {
    const collectionAmount = this.effectiveAmount();
    return this.items
      .map(item => (item.effectiveAmount() - collectionAmount) * item.price)
      .reduce((a, b) => a + b, 0) +
      collectionAmount * this.price;
  }
  static totalValue() {
    return Object.values(this.collections)
      .reduce((sum, collection) => sum + collection.totalValue(), 0);
  }
}

class Item {
  constructor(preliminary) {
    Object.assign(this, preliminary);
    this.category = this.itemId.split('_', 1)[0];
    this.collection = Collection.collections[this.category];
    this.collection.items.push(this);
    this.itemTranslationKey = `${this.itemId}.name`;
    this.legacyItemId = this.itemId.replace(/^flower_|^egg_/, '');
    this.markers = [];  // filled by Marker.init();
    this._amountKey = `amount.${this.itemId}`;
    this._insertMenuElement();
  }
  // `.init()` needs DOM ready and jquery, but no other map realted scripts initialized
  static init() {
    this._installEventHandlers();
    this.items = Object.create(null);
    return Loader.promises['items_value'].consumeJson(data => {
      const weekly = Collection.init(data.full);
      Object.entries(data.items).forEach(([itemId, price]) =>
        this.items[itemId] = new Item({itemId, price}));
      this.compatInit();
      return weekly;
    });
  }
  // prefill whenever “new” inventory is empty and “old” inventory exists
  static compatInit() {
    const oldAmounts = JSON.parse(localStorage.getItem("inventory"));
    if (oldAmounts && !Object.keys(localStorage).some(key => key.startsWith('amount.'))) {
      Object.entries(Item.items).forEach(([itemId, item]) => item.amount = oldAmounts[itemId]);
      console.log('old amounts converted');
      localStorage.removeItem('inventory');
    }
  }
  static _installEventHandlers() {
    $('.side-menu')
      .on('contextmenu', event => {
        const itemElement = $(event.target).closest('.collectible-wrapper')[0];
        // clicked inside of the collectible, but outside of its counter part?
        if (itemElement && event.target.querySelector('.counter')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const item = itemElement.rdoItem;
          if (!['flower_agarita', 'flower_blood_flower'].includes(item.itemId)) {
            MapBase.highlightImportantItem(item.itemId, item.category);
          }
        }
      })[0].addEventListener('click', event => {  // `.on()` can’t register to capture phase
        if (event.target.classList.contains('counter-button')) {
          event.stopImmediatePropagation();
          const $target = $(event.target);
          Inventory.changeMarkerAmount(
            $target.closest('.collectible-wrapper')[0].rdoItem.legacyItemId,
            $target.text() === '-' ? -1 : 1
          );
        } else if (event.target.classList.contains('open-submenu')) {
          event.stopPropagation();
          $(event.target).toggleClass('rotate')
            .parent().parent().children('.menu-hidden').toggleClass('opened')
        }
      }, {capture: true});
  }
  _insertMenuElement() {
    this.$menuButton = $(`
      <div class="collectible-wrapper" data-type="${this.legacyItemId}"
        data-help="${['flower_agarita', 'flower_blood_flower'].includes(this.itemId) ?
          'item_night_only' : 'item'}">
        <img class='collectible-icon' src="assets/images/icons/game/${this.itemId}.png"
          alt='Set icon'>
        <span class="collectible-text">
          <p class="collectible" data-text="${this.itemTranslationKey}"></p>
          <span class="counter">
            <div class="counter-button">-</div><!--
            --><div class="counter-number"></div><!--
            --><div class="counter-button">+</div>
          </span>
        </span>
      </div>
    `).translate();
    this.$menuButton[0].rdoItem = this;
    this.amount = this.amount;  // trigger counter update
    this.$menuButton
      .appendTo(this.collection.$submenu)
      .find('.counter')
        .toggle(InventorySettings.isEnabled)
      .end()

  }
  get amount() {
    return +localStorage.getItem(this._amountKey);
  }
  set amount(value) {
    if (value < 0) value = 0;
    if (value) {
      localStorage.setItem(this._amountKey, value);
    } else {
      localStorage.removeItem(this._amountKey);
    }
    this.$menuButton.find('.counter-number')
      .text(value)
      .toggleClass('text-danger', value >= InventorySettings.stackSize);
  }
  // use the following marker based property only after Marker.init()!
  effectiveAmount() {
    if (InventorySettings.isEnabled) {
      return this.amount;
    } else {
      return this.markers.filter(marker => marker.isCurrent && marker.isCollected).length;
    }
  }
  // requires Marker and Cycles to be loaded
  currentMarkers() {
    return this.markers.filter(marker => marker.isCurrent);
  }
  updateMenu() {
    const currentMarkers = this.currentMarkers();
    const buggy = currentMarkers.every(marker => marker.tool == -1);
    const isWeekly = Collection.weeklyItems.includes(this.itemId);
    this.$menuButton
      .attr('data-help', () => {
        if (buggy) {
          return 'item_unavailable';
        } else if (['flower_agarita', 'flower_blood_flower'].includes(this.itemId)) {
          return 'item_night_only';
        } else if (isWeekly) {
          return 'item_weekly';
        } else {
          return 'item';
        }
      })
      .toggleClass('not-found', buggy)
      .toggleClass('disabled', currentMarkers.every(marker => !marker.canCollect))
      .toggleClass('weekly-item', isWeekly)
      .find('.counter')
        .toggle(InventorySettings.isEnabled)
      .end()

    return buggy;
  }
}