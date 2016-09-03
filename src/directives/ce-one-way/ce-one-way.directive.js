/**
 *
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @desc Enable unidirectional data bindings for Angular 1.5 components
 * @example <my-input message="$ctrl.str"
             on-message-changed="$ctrl.onMessageChanged($event)"
             ce-one-way>
           </my-input>
 */
angular
  .module('robdodson.ce-bind')
  .directive('ceOneWay', ceOneWay);

// Make Angular 1.5, one-way bindings work.
// Data is always copied before it is passed into the
// child to prevent the child from modifying state in
// the parent. Because Polymer/Custom Elements don't
// have a notion of passing callbacks in, an Output
// is treated as a regular event handler and passed
// the CustomEvent dispatched by the element
function ceOneWay() {
  return {
    restrict: 'A',
    scope: false,
    compile: function($element, $attrs) {

      // parse an expression and returns its metadata
      function parse(expression) {

        // keep a local cache so we don't parse the same expression again and again...
        var cache = {};
        var matchedPattern = null;

        return function() {
          if (!cache[expression]) {

            // cache[expression][0] = expression
            // cache[expression][1] = controller alias (with dot) i.e. "$ctrl." or "undefined" for non-aliased controllers
            // cache[expression][2] = controller alias (without dot) i.e. "$ctrl" or "undefined" for non-aliased controllers
            // cache[expression][3] = event handler
            // cache[expression][4] = event handler params (i.e. "$event, a, b, c")

            matchedPattern = expression.match(/((.*)\.)?(\w*)\((.*)\)/);
            cache[expression] = {
              handler: matchedPattern[3],
              controllerAlias: matchedPattern[2]
            }
          }
          return cache[expression];
        }
      }

      // Find the controller alias associated with the $scope
      function getCtrlAlias(expression) {
        var parsedExpression = parse(expression)();
        if (parsedExpression) {
          return parsedExpression.controllerAlias;
        }
      }

      // Find the event handler associated with the $ctrl
      function getHandler(expression) {
        var parsedExpression = parse(expression)();
        if (parsedExpression) {
          return parsedExpression.handler;
        }
      }

      // Remove Angular's camelCasing of event names and
      // strip on- prefix
      function getEvent(expression) {
        var event = denormalize(expression);
        return event.replace('on-', '');
      }

      // Convert Angular camelCase property to dash-case
      function denormalize(str) {
        return str.replace(/[A-Z]/g, function(c) {
          return '-' + c.toLowerCase();
        });
      }

      // Setup event handler and return a deregister function
      // to be used during $destroy
      function createHandler($scope, element, event, handler, ctrlScope) {
        var listener = function(e) {
          $scope.$evalAsync(handler.bind(ctrlScope, e));
        }
        element.addEventListener(event, listener);
        return function() {
          element.removeEventListener(event, listener);
        }
      }

      return function($scope, $element, $attrs) {
        // Store event handler remover functions in
        // here and use on $destroy
        var cleanup = [];

        // Setup an event handler to act as an output
        // Since elements communicate to the outside world
        // using events, we'll simulate angular's '&'
        // output callbacks using regular event handlers
        function makeOutput(handlerName, eventName) {
          var handler = getHandler(handlerName);
          var ctrlAlias = getCtrlAlias(handlerName);
          var ctrlScope = ($scope[ctrlAlias] || $scope);
          var event = getEvent(eventName);
          var removeHandler = createHandler(
            $scope,
            $element[0],
            event,
            ctrlScope[handler],
            ctrlScope
          );
          cleanup.push(removeHandler);
        }

        // Setup a watcher on the controller property
        // and create a copy when setting data on the
        // element so it can't mutate the parent's data
        // TODO: Don't do a deep watch. Differentiate
        // based on object type and use watchCollection
        function makeInput(ctrlProp, elProp) {
          $scope.$watch(ctrlProp, function(value) {
            if (angular.isArray(value)) {
              $element[0][elProp] = value.slice(0);
            } else if (angular.isObject(value)) {
              $element[0][elProp] = Object.assign({}, value);
            } else {
              $element[0][elProp] = value;
            }
          }, true);
        }

        // Iterate over element attributes and look for one way
        // inputs or outputs
        for (var prop in $attrs) {
          if (angular.isString($attrs[prop]) && $attrs[prop] !== '') {
            // Look for an Output like
            // ==> on-foo="doBar()"
            // ==> on-foo="$ctrl.doBar()"
            // Note that angular's $attr object will camelCase things beginning
            // with "on-". So on-foo becomes onFoo
            if (prop.substr(0, 2) === 'on' && $attrs[prop].indexOf('(') !== -1) {
              makeOutput($attrs[prop], prop);
            } else {
              makeInput($attrs[prop], prop);
            }
          }
        }

        // Listen for $destroy event and remove all event
        // listeners. $watchers should be automatically removed
        // so don't need to do any work there
        $scope.$on('$destroy', function() {
          cleanup.forEach(function(removeFn) {
            removeFn();
          });
        });

      };
    }
  }
}
