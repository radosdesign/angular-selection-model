/**
 * Selection Model - a selection aware companion for ngRepeat
 *
 * @package selectionModel
 * @copyright 2014 Justin Russell, released under the MIT license
 */

angular.module('selectionModel').directive('selectionModel', [
  'selectionStack', 'uuidGen', 'selectionModelOptions',
  function(selectionStack, uuidGen, selectionModelOptions) {
    'use strict';
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {

        /**
         * Defaults from the options provider
         *
         * Use `selectionModelOptionsProvider` when configuring your module to
         * set application wide defaults
         */
        var defaultOptions = selectionModelOptions.get()
          , defaultSelectedAttribute = defaultOptions.selectedAttribute
          , defaultTrackBy = defaultOptions.trackBy
          , defaultSelectedClass = defaultOptions.selectedClass
          , defaultType = defaultOptions.type
          , defaultMode = defaultOptions.mode;

        /**
         * The selection model type
         *
         * Controls how selections are presented on the underlying element. Use
         * 'basic' (the default) to simplye assign a "selected" class to
         * selected items. If set to 'checkbox' it'll also sync the checked
         * state of the first checkbox child in each underlying `tr` or `li`
         * element.
         *
         * Note that the 'checkbox' type assumes the first input child element
         * will be the checkbox.
         */
        var smType = scope.$eval(attrs.selectionModelType) || defaultType;

        /**
         * The selection mode
         *
         * Supports 'single', 'multi[ple]', and 'multi[ple]-additive'. Single
         * mode will only allow one item to be marked as selected at a time.
         * Vanilla multi mode allows for multiple selectioned items but requires
         * modifier keys to select more than one item at a time. Additive-multi
         * mode allows for multiple items to be selected and will not deselect
         * other items when a vanilla click is made. Additive multi also allows
         * for de-selection without a modifier key (think of `'multi-additive'`
         * as turning every click into a ctrl-click.
         */
        var smMode = scope.$eval(attrs.selectionModelMode) || defaultMode
          , isMultiMode = /^multi(ple)?(-additive)?$/.test(smMode)
          , isModeAdditive = /^multi(ple)?-additive/.test(smMode);

        /**
         * The item attribute to track selected status
         *
         * Use `selection-model-selected-attribute` to override the default
         * attribute.
         */
        var selectedAttribute = scope.$eval(attrs.selectionModelSelectedAttribute) || defaultSelectedAttribute;

        /**
         * Track by attribute
         *
         * Use `track-by` to override the default attribute.
         */
        var trackBy = scope.$eval(attrs.trackBy) || defaultTrackBy;

        /**
         * The selected class name
         *
         * Will be applied to dom items (e.g. `tr` or `li`) representing
         * selected items. Use `selection-model-selected-class` to override the
         * default class name.
         */
        var selectedClass = scope.$eval(attrs.selectionModelSelectedClass) || defaultSelectedClass;

        /**
         * The change callback
         *
         * To be executed whenever the item's selected state changes.
         */
        var smOnChange = attrs.selectionModelOnChange;

        /**
         * The list of items
         *
         * selectionModel must be attached to the same element as an ngRepeat
         */
        var repeatLine = attrs.ngRepeat;
        if(!repeatLine) {
          throw 'selectionModel must be used along side ngRepeat';
        }

        /**
         * The list of selected items
         *
         * If used should resolve to an (initially empty) array.  Use this in
         * your view as **read only** if you'd like to do something with just
         * the selected items. Note that order is not guarenteed and any items
         * added to this array programmatically are ignored.
         */
        var selectedItemsList = scope.$eval(attrs.selectionModelSelectedItems);

        /**
         * The last-click stack id
         *
         * There may be multiple selection models on the page and each will need
         * independent click stacks.
         */
        var clickStackId = (function() {
          if(!isMultiMode) {
            return null;
          }
          var idAttr = 'data-selection-model-stack-id';
          // Id may be cached on this element
          var stackId = element.attr(idAttr);
          if(stackId) {
            return stackId;
          }

          // Otherwise it may be on the partent
          stackId = element.parent().attr(idAttr);
          if(stackId) {
            element.attr(idAttr, stackId);
            return stackId;
          }

          // welp guess we're the first, create a new one and cache it on this
          // element (for us) and the parent element (for others)
          stackId = uuidGen.create();
          element.attr(idAttr, stackId);
          element.parent().attr(idAttr, stackId);
          return stackId;
        }());

        /**
         * repeatParts[0] -> The item expression
         * repeatParts[1] -> The collection expression
         * repeatParts[2] -> The track by expression (if present)
         */
        var repeatParts = repeatLine.split(/\sin\s|\strack\sby\s/g)
          , smItem = scope.$eval(repeatParts[0])
          , hasTrackBy = repeatParts.length > 2;

        /**
         * Returns index of the item in the array or -1 if not found
         * @param array
         * @param trackByAttr
         * @param item
         * @returns {number}
         */
        var indexOfTrackBy = function(array, trackByAttr, item) {
          for(var i = 0; i < array.length; i += 1) {
            if(array[i][trackByAttr] === item[trackByAttr]) {
              return i;
            }
          }
          return -1;
        };

        /**
         * Returns true if this item is in selectedItemsList, false otherwise
         * @param item
         */
        var isSelected = function(item) {
          var index = indexOfTrackBy(selectedItemsList, trackBy, item);
          return index > -1;
        };

        var updateDom = function() {
          var isSelectedResult = isSelected(smItem);
          if(isSelectedResult) {
            element.addClass(selectedClass);
          } else {
            element.removeClass(selectedClass);
          }

          if('checkbox' === smType) {
            var cb = element.find('input');
            cb.prop('checked', isSelectedResult);
          }
        };

        var getAllVisibleItems = function() {
          return scope.$eval(repeatParts[1]);
        };

        // Strips away filters - this lets us e.g. deselect items that are
        // filtered out
        var getAllItems = function() {
          return scope.$eval(repeatParts[1].split(/[|=]/)[0]);
        };

        var updateSelectedAttributeValue = function() {
          angular.forEach(getAllVisibleItems(), function(item) {
            item[selectedAttribute] = isSelected(item);
          });
        };

        var selectItem = function(item) {
          var index = indexOfTrackBy(selectedItemsList, trackBy, item);
          if(index === -1) {
            selectedItemsList.push(item);
          }
        };

        // Get us back to a "clean" state. Usually we'll want to skip
        // deselection for items that are about to be selected again to avoid
        // firing the `selection-mode-on-change` handler extra times.
        //
        // `except` param may be `undefined` (deselect all the things), a single
        // item (don't deselect *that* item), or an array of two items (don't
        // deselect anything between those items inclusively).
        var deselectAllItemsExcept = function(except) {
          var useSelectedArray = angular.isArray(selectedItemsList)
            , isRange = angular.isArray(except) && 2 === except.length
            , allItems = getAllItems()
            , numItemsFound = 0
            , doSelect = true
            , ixItem;
          if(useSelectedArray) {
            selectedItemsList.length = 0;
          }
          angular.forEach(allItems, function(item) {
            if(isRange) {
              ixItem = indexOfTrackBy(except, trackBy, item);
              if(ixItem > -1) {
                numItemsFound++;
                doSelect = true;
                except.splice(ixItem, 1);
              } else {
                doSelect = 1 === numItemsFound;
              }
            } else {
              doSelect = item[trackBy] === except[trackBy];
            }
            if(doSelect) {
              selectItem(item);
            }
            else {
              var index = indexOfTrackBy(selectedItemsList, trackBy, item);
              if(index > -1) {
                selectedItemsList.splice(index, 1);
              }
            }
          });
        };

        var selectItemsBetween = function(lastItem) {
          var allItems = getAllVisibleItems()
            , foundLastItem = false
            , foundThisItem = false;

          lastItem = lastItem || smItem;

          angular.forEach(getAllVisibleItems(), function(item) {
            foundThisItem = foundThisItem || item[trackBy] === smItem[trackBy];
            foundLastItem = foundLastItem || item[trackBy] === lastItem[trackBy];
            var inRange = (foundLastItem + foundThisItem) === 1;
            if(inRange || item[trackBy] === smItem[trackBy] || item[trackBy] === lastItem[trackBy]) {
              // Put this item into selectedItems
              selectItem(item);
            }
          });
        };

        /**
         * Item click handler
         *
         * Use the `ctrl` key to select/deselect while preserving the rest of
         * your selection. Note your your selection mode must be set to
         * `'multiple'` to allow for more than one selected item at a time. In
         * single select mode you still must use the `ctrl` or `shitft` keys to
         * deselect an item.
         *
         * The `shift` key allows you to select ranges of items at a time. Use
         * `ctrl` + `shift` to select a range while preserving your existing
         * selection. In single select mode `shift` behaves like `ctrl`.
         *
         * When an item is clicked with no modifier keys pressed it will be the
         * only selected item.
         *
         * On Mac the `meta` key is treated as `ctrl`.
         *
         * Note that when using the `'checkbox'` selection model type clicking
         * on a checkbox will have no effect on any row other than the one the
         * checkbox is in.
         */
        var handleClick = function(event) {

          /**
           * Set by the `selectionModelIgnore` directive
           *
           * Use `selectionModelIgnore` to cause `selectionModel` to selectively
           * ignore clicks on elements. This is useful if you want to manually
           * change a selection when certain things are clicked.
           */
          if(event.selectionModelIgnore || (event.originalEvent && event.originalEvent.selectionModelIgnore)) {
            return;
          }

          console.log('XXX: event.selectionModelClickHandled = ' + event.selectionModelClickHandled);

          // Never handle a single click twice.
          if(event.selectionModelClickHandled || (event.originalEvent && event.originalEvent.selectionModelClickHandled)) {
            return;
          }
          event.selectionModelClickHandled = true;
          if(event.originalEvent) {
            event.originalEvent.selectionModelClickHandled = true;
          }

          var isCtrlKeyDown = event.ctrlKey || event.metaKey || isModeAdditive
            , isShiftKeyDown = event.shiftKey
            , target = event.target || event.srcElement
            , isCheckboxClick = 'checkbox' === smType &&
                'INPUT' === target.tagName &&
                'checkbox' === target.type;

          /**
           * Guard against label + checkbox clicks
           *
           * Clicking a label will cause a click event to also be fired on the
           * associated input element. If that input is nearby (i.e. under the
           * selection model element) we'll suppress the click on the label to
           * avoid duplicate click events.
           */
          if('LABEL' === target.tagName) {
            var labelFor = angular.element(target).attr('for');
            if(labelFor) {
              var childInputs = element[0].getElementsByTagName('INPUT'), ix;
              for(ix = childInputs.length; ix--;) {
                if(childInputs[ix].id === labelFor) {
                  return;
                }
              }
            } else if(target.getElementsByTagName('INPUT').length) {
              // Label has a nested input element, we'll handle the click on
              // that element
              return;
            }
          }

          // Select multiple allows for ranges - use shift key
          if(isShiftKeyDown && isMultiMode && !isCheckboxClick) {
            // Use ctrl+shift for additive ranges
            if(!isCtrlKeyDown) {
              scope.$apply(function() {
                deselectAllItemsExcept([smItem, selectionStack.peek(clickStackId)]);
              });
            }
            selectItemsBetween(selectionStack.peek(clickStackId));
            scope.$apply();
            return;
          }

          // Use ctrl/shift without multi select to true toggle a row
          if(isCtrlKeyDown || isShiftKeyDown || isCheckboxClick) {
            var isSelectedResult = !isSelected(smItem);
            if(!isMultiMode) {
              deselectAllItemsExcept(smItem);
            }
            if(isSelectedResult) {
              selectionStack.push(clickStackId, smItem);
              selectItem(smItem);
            }
            else {
              // Remove from list
              var index = indexOfTrackBy(selectedItemsList, trackBy, smItem);
              if(index > -1) {
                selectedItemsList.splice(index, 1);
              }
            }
            updateDom();
            updateSelectedAttributeValue();

            scope.$apply();
            return;
          }

          // Otherwise the clicked on row becomes the only selected item
          console.log('XXX: handleClick: item: ' + JSON.stringify(smItem));

          deselectAllItemsExcept(smItem);
          scope.$apply();

          selectionStack.push(clickStackId, smItem);
          selectItem(smItem);
          scope.$apply();
        };

        element.on('click', handleClick);
        if('checkbox' === smType) {
          var elCb = element.find('input');
          if(elCb[0] && 'checkbox' === elCb[0].type) {
            element.find('input').on('click', handleClick);
          }
        }

        // We might be coming in with a selection
        updateDom();
        updateSelectedAttributeValue();

        scope.$watch(repeatParts[0] + '.' + selectedAttribute, function(newVal, oldVal) {
          // Be mindful of programmatic changes to selected state
          if (newVal !== oldVal) {
            if (!isMultiMode && newVal && !oldVal) {
              deselectAllItemsExcept(smItem);
            }

            if (newVal) {
              console.log('XXX: Adding item to selectedItems because selectedAttr was modified');
              selectItem(smItem);
            }
            else {
              var index = indexOfTrackBy(selectedItemsList, trackBy, smItem);
              if (index > -1) {
                console.log('XXX: Removing item from selectedItems because selectedAttr was modified');
                selectedItemsList.splice(index, 1);
              }
            }

            updateDom();

            if (smOnChange) {
              scope.$eval(smOnChange);
            }
          }
        });

        // If we're using track-by with ngRepeat it's possible the item
        // reference will change without this directive getting re-linked.
        if(hasTrackBy) {
          scope.$watch(repeatParts[0], function(newVal) {
            smItem = newVal;
          });
        }
      }
    };
  }
]);
