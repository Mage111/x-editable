/**
Makes editable any HTML element on the page. Applied as jQuery method.

@class editable
@uses editableContainer
**/
(function ($) {
    "use strict";

    var Editable = function (element, options) {
        this.$element = $(element);
        //data-* has more priority over js options: because dynamically created elements may change data-* 
        this.options = $.extend({}, $.fn.editable.defaults, options, $.fn.editableutils.getConfigData(this.$element));  
        if(this.options.selector) {
            this.initLive();
        } else {
            this.init();
        }
        
        //check for transition support
        if(this.options.highlight && !$.fn.editableutils.supportsTransitions()) {
            this.options.highlight = false;
        }
    };

    Editable.prototype = {
        constructor: Editable, 
        init: function () {
            var isValueByText = false, 
                doAutotext, finalize;

            //name
            this.options.name = this.options.name || this.$element.attr('id');
             
            //create input of specified type. Input needed already here to convert value for initial display (e.g. show text by id for select)
            //also we set scope option to have access to element inside input specific callbacks (e. g. source as function)
            this.options.scope = this.$element[0]; 
            this.input = $.fn.editableutils.createInput(this.options);
            if(!this.input) {
                return; 
            }            

            //set value from settings or by element's text
            if (this.options.value === undefined || this.options.value === null) {
                this.value = this.input.html2value($.trim(this.$element.html()));
                isValueByText = true;
            } else {
                /*
                  value can be string when received from 'data-value' attribute
                  for complext objects value can be set as json string in data-value attribute, 
                  e.g. data-value="{city: 'Moscow', street: 'Lenina'}"
                */
                this.options.value = $.fn.editableutils.tryParseJson(this.options.value, true); 
                if(typeof this.options.value === 'string') {
                    this.value = this.input.str2value(this.options.value);
                } else {
                    this.value = this.options.value;
                }
            }
            
            //add 'editable' class to every editable element
            this.$element.addClass('editable');
            
            //specifically for "textarea" add class .editable-pre-wrapped to keep linebreaks
            if(this.input.type === 'textarea') {
                this.$element.addClass('editable-pre-wrapped');
            }
            
            //attach handler activating editable. In disabled mode it just prevent default action (useful for links)
            if(this.options.toggle !== 'manual') {
                this.$element.addClass('editable-click');
                this.$element.on(this.options.toggle + '.editable', $.proxy(function(e){
                    //prevent following link if editable enabled
                    if(!this.options.disabled) {
                        e.preventDefault();
                    }
                    
                    //stop propagation not required because in document click handler it checks event target
                    //e.stopPropagation();
                    
                    if(this.options.toggle === 'mouseenter') {
                        //for hover only show container
                        this.show();
                    } else {
                        //when toggle='click' we should not close all other containers as they will be closed automatically in document click listener
                        var closeAll = (this.options.toggle !== 'click');
                        this.toggle(closeAll);
                    }
                }, this));
            } else {
                this.$element.attr('tabindex', -1); //do not stop focus on element when toggled manually
            }
            
            //if display is function it's far more convinient to have autotext = always to render correctly on init
            //see https://github.com/vitalets/x-editable-yii/issues/34
            if(typeof this.options.display === 'function') {
                this.options.autotext = 'always';
            }
            
            //check conditions for autotext:
            switch(this.options.autotext) {
              case 'always':
               doAutotext = true;
              break;
              case 'auto':
                //if element text is empty and value is defined and value not generated by text --> run autotext
                doAutotext = !$.trim(this.$element.text()).length && this.value !== null && this.value !== undefined && !isValueByText;
              break;
              default:
               doAutotext = false;
            }

            //depending on autotext run render() or just finilize init
            $.when(doAutotext ? this.render() : true).then($.proxy(function() {
                if(this.options.disabled) {
                    this.disable();
                } else {
                    this.enable(); 
                }
               /**        
               Fired when element was initialized by `$().editable()` method. 
               Please note that you should setup `init` handler **before** applying `editable`. 
                              
               @event init 
               @param {Object} event event object
               @param {Object} editable editable instance (as here it cannot accessed via data('editable'))
               @since 1.2.0
               @example
               $('#username').on('init', function(e, editable) {
                   alert('initialized ' + editable.options.name);
               });
               $('#username').editable();
               **/                  
                this.$element.triggerHandler('init', this);
            }, this));
        },

        /*
         Initializes parent element for live editables 
        */
        initLive: function() {
           //store selector 
           var selector = this.options.selector;
           //modify options for child elements
           this.options.selector = false; 
           this.options.autotext = 'never';
           //listen toggle events
           this.$element.on(this.options.toggle + '.editable', selector, $.proxy(function(e){
               var $target = $(e.target);
               if(!$target.data('editable')) {
                   //if delegated element initially empty, we need to clear it's text (that was manually set to `empty` by user)
                   //see https://github.com/vitalets/x-editable/issues/137 
                   if($target.hasClass(this.options.emptyclass)) {
                      $target.empty();
                   }
                   $target.editable(this.options).trigger(e);
               }
           }, this)); 
        },
        
        /*
        Renders value into element's text.
        Can call custom display method from options.
        Can return deferred object.
        @method render()
        @param {mixed} response server response (if exist) to pass into display function
        */          
        render: function(response) {
            //do not display anything
            if(this.options.display === false) {
                return;
            }
            
            //if input has `value2htmlFinal` method, we pass callback in third param to be called when source is loaded
            if(this.input.value2htmlFinal) {
                return this.input.value2html(this.value, this.$element[0], this.options.display, response); 
            //if display method defined --> use it    
            } else if(typeof this.options.display === 'function') {
                return this.options.display.call(this.$element[0], this.value, response);
            //else use input's original value2html() method    
            } else {
                return this.input.value2html(this.value, this.$element[0]); 
            }
        },
        
        /**
        Enables editable
        @method enable()
        **/          
        enable: function() {
            this.options.disabled = false;
            this.$element.removeClass('editable-disabled');
            this.handleEmpty(this.isEmpty);
            if(this.options.toggle !== 'manual') {
                if(this.$element.attr('tabindex') === '-1') {    
                    this.$element.removeAttr('tabindex');                                
                }
            }
        },
        
        /**
        Disables editable
        @method disable()
        **/         
        disable: function() {
            this.options.disabled = true; 
            this.hide();           
            this.$element.addClass('editable-disabled');
            this.handleEmpty(this.isEmpty);
            //do not stop focus on this element
            this.$element.attr('tabindex', -1);                
        },
        
        /**
        Toggles enabled / disabled state of editable element
        @method toggleDisabled()
        **/         
        toggleDisabled: function() {
            if(this.options.disabled) {
                this.enable();
            } else { 
                this.disable(); 
            }
        },  
        
        /**
        Sets new option
        
        @method option(key, value)
        @param {string|object} key option name or object with several options
        @param {mixed} value option new value
        @example
        $('.editable').editable('option', 'pk', 2);
        **/          
        option: function(key, value) {
            //set option(s) by object
            if(key && typeof key === 'object') {
               $.each(key, $.proxy(function(k, v){
                  this.option($.trim(k), v); 
               }, this)); 
               return;
            }

            //set option by string             
            this.options[key] = value;                          
            
            //disabled
            if(key === 'disabled') {
               return value ? this.disable() : this.enable();
            } 
            
            //value
            if(key === 'value') {
                this.setValue(value);
            }
            
            //transfer new option to container! 
            if(this.container) {
                this.container.option(key, value);  
            }
             
            //pass option to input directly (as it points to the same in form)
            if(this.input.option) {
                this.input.option(key, value);
            }
            
        },              
        
        /*
        * set emptytext if element is empty
        */
        handleEmpty: function (isEmpty) {
            //do not handle empty if we do not display anything
            if(this.options.display === false) {
                return;
            }

            /* 
            isEmpty may be set directly as param of method.
            It is required when we enable/disable field and can't rely on content 
            as node content is text: "Empty" that is not empty %)
            */
            if(isEmpty !== undefined) { 
                this.isEmpty = isEmpty;
            } else {
                //detect empty
                if($.trim(this.$element.html()) === '') { 
                    this.isEmpty = true;
                } else if($.trim(this.$element.text()) !== '') {
                    this.isEmpty = false;
                } else {
                    //e.g. '<img>'
                    this.isEmpty = !this.$element.height() || !this.$element.width();
                }
            }           
            
            //emptytext shown only for enabled
            if(!this.options.disabled) {
                if (this.isEmpty) {
                    this.$element.html(this.options.emptytext);
                    if(this.options.emptyclass) {
                        this.$element.addClass(this.options.emptyclass);
                    }
                } else if(this.options.emptyclass) {
                    this.$element.removeClass(this.options.emptyclass);
                }
            } else {
                //below required if element disable property was changed
                if(this.isEmpty) {
                    this.$element.empty();
                    if(this.options.emptyclass) {
                        this.$element.removeClass(this.options.emptyclass);
                    }
                }
            }
        },        
        
        /**
        Shows container with form
        @method show()
        @param {boolean} closeAll Whether to close all other editable containers when showing this one. Default true.
        **/  
        show: function (closeAll) {
            if(this.options.disabled) {
                return;
            }
            
            //init editableContainer: popover, tooltip, inline, etc..
            if(!this.container) {
                var containerOptions = $.extend({}, this.options, {
                    value: this.value,
                    input: this.input //pass input to form (as it is already created)
                });
                this.$element.editableContainer(containerOptions);
                //listen `save` event 
                this.$element.on("save.internal", $.proxy(this.save, this));
                this.container = this.$element.data('editableContainer'); 
            } else if(this.container.tip().is(':visible')) {
                return;
            }      
            
            //show container
            this.container.show(closeAll);
        },
        
        /**
        Hides container with form
        @method hide()
        **/       
        hide: function () {   
            if(this.container) {  
                this.container.hide();
            }
        },
        
        /**
        Toggles container visibility (show / hide)
        @method toggle()
        @param {boolean} closeAll Whether to close all other editable containers when showing this one. Default true.
        **/  
        toggle: function(closeAll) {
            if(this.container && this.container.tip().is(':visible')) {
                this.hide();
            } else {
                this.show(closeAll);
            }
        },
        
        /*
        * called when form was submitted
        */          
        save: function(e, params) {
            //mark element with unsaved class if needed
            if(this.options.unsavedclass) {
                /*
                 Add unsaved css to element if:
                  - url is not user's function 
                  - value was not sent to server
                  - params.response === undefined, that means data was not sent
                  - value changed 
                */
                var sent = false;
                sent = sent || typeof this.options.url === 'function';
                sent = sent || this.options.display === false; 
                sent = sent || params.response !== undefined; 
                sent = sent || (this.options.savenochange && this.input.value2str(this.value) !== this.input.value2str(params.newValue)); 
                
                if(sent) {
                    this.$element.removeClass(this.options.unsavedclass); 
                } else {
                    this.$element.addClass(this.options.unsavedclass);                    
                }
            }
            
            //highlight when saving
            if(this.options.highlight) {
                var $e = this.$element,
                    bgColor = $e.css('background-color');
                    
                $e.css('background-color', this.options.highlight);
                setTimeout(function(){
                    if(bgColor === 'transparent') {
                        bgColor = ''; 
                    }
                    $e.css('background-color', bgColor);
                    $e.addClass('editable-bg-transition');
                    setTimeout(function(){
                       $e.removeClass('editable-bg-transition');  
                    }, 1700);
                }, 10);
            }
            
            //set new value
            this.setValue(params.newValue, false, params.response);
            
            /**        
            Fired when new value was submitted. You can use <code>$(this).data('editable')</code> to access to editable instance
            
            @event save 
            @param {Object} event event object
            @param {Object} params additional params
            @param {mixed} params.newValue submitted value
            @param {Object} params.response ajax response
            @example
            $('#username').on('save', function(e, params) {
                alert('Saved value: ' + params.newValue);
            });
            **/
            //event itself is triggered by editableContainer. Description here is only for documentation              
        },

        validate: function () {
            if (typeof this.options.validate === 'function') {
                return this.options.validate.call(this, this.value);
            }
        },
        
        /**
        Sets new value of editable
        @method setValue(value, convertStr)
        @param {mixed} value new value 
        @param {boolean} convertStr whether to convert value from string to internal format
        **/         
        setValue: function(value, convertStr, response) {
            if(convertStr) {
                this.value = this.input.str2value(value);
            } else {
                this.value = value;
            }
            if(this.container) {
                this.container.option('value', this.value);
            }
            $.when(this.render(response))
            .then($.proxy(function() {
                this.handleEmpty();
            }, this));
        },
        
        /**
        Activates input of visible container (e.g. set focus)
        @method activate()
        **/         
        activate: function() {
            if(this.container) {
               this.container.activate(); 
            }
        },
        
        /**
        Removes editable feature from element
        @method destroy()
        **/        
        destroy: function() {
            this.disable();
            
            if(this.container) {
               this.container.destroy(); 
            }
            
            this.input.destroy();

            if(this.options.toggle !== 'manual') {
                this.$element.removeClass('editable-click');
                this.$element.off(this.options.toggle + '.editable');
            } 
            
            this.$element.off("save.internal");
            
            this.$element.removeClass('editable editable-open editable-disabled');
            this.$element.removeData('editable');
        }        
    };

    /* EDITABLE PLUGIN DEFINITION
    * ======================= */

    /**
    jQuery method to initialize editable element.
    
    @method $().editable(options)
    @params {Object} options
    @example
    $('#username').editable({
        type: 'text',
        url: '/post',
        pk: 1
    });
    **/
    $.fn.editable = function (option) {
        //special API methods returning non-jquery object
        var result = {}, args = arguments, datakey = 'editable';
        switch (option) {
            /**
            Runs client-side validation for all matched editables
            
            @method validate()
            @returns {Object} validation errors map
            @example
            $('#username, #fullname').editable('validate');
            // possible result:
            {
              username: "username is required",
              fullname: "fullname should be minimum 3 letters length"
            }
            **/
            case 'validate':
                this.each(function () {
                    var $this = $(this), data = $this.data(datakey), error;
                    if (data && (error = data.validate())) {
                        result[data.options.name] = error;
                    }
                });
            return result;

            /**
            Returns current values of editable elements.   
            Note that it returns an **object** with name-value pairs, not a value itself. It allows to get data from several elements.    
            If value of some editable is `null` or `undefined` it is excluded from result object.
            When param `isSingle` is set to **true** - it is supposed you have single element and will return value of editable instead of object.   
             
            @method getValue()
            @param {bool} isSingle whether to return just value of single element
            @returns {Object} object of element names and values
            @example
            $('#username, #fullname').editable('getValue');
            //result:
            {
            username: "superuser",
            fullname: "John"
            }
            //isSingle = true
            $('#username').editable('getValue', true);
            //result "superuser" 
            **/
            case 'getValue':
                if(arguments.length === 2 && arguments[1] === true) { //isSingle = true
                    result = this.eq(0).data(datakey).value;
                } else {
                    this.each(function () {
                        var $this = $(this), data = $this.data(datakey);
                        if (data && data.value !== undefined && data.value !== null) {
                            result[data.options.name] = data.input.value2submit(data.value);
                        }
                    });
                }
            return result;

            /**
            This method collects values from several editable elements and submit them all to server.   
            Internally it runs client-side validation for all fields and submits only in case of success.  
            See <a href="#newrecord">creating new records</a> for details.
            
            @method submit(options)
            @param {object} options 
            @param {object} options.url url to submit data 
            @param {object} options.data additional data to submit
            @param {object} options.ajaxOptions additional ajax options
            @param {function} options.error(obj) error handler 
            @param {function} options.success(obj,config) success handler
            @returns {Object} jQuery object
            **/
            case 'submit':  //collects value, validate and submit to server for creating new record
                var config = arguments[1] || {},
                $elems = this,
                errors = this.editable('validate'),
                values;

                if($.isEmptyObject(errors)) {
                    values = this.editable('getValue'); 
                    if(config.data) {
                        $.extend(values, config.data);
                    }                    
                    
                    $.ajax($.extend({
                        url: config.url, 
                        data: values, 
                        type: 'POST'                        
                    }, config.ajaxOptions))
                    .success(function(response) {
                        //successful response 200 OK
                        if(typeof config.success === 'function') {
                            config.success.call($elems, response, config);
                        } 
                    })
                    .error(function(){  //ajax error
                        if(typeof config.error === 'function') {
                            config.error.apply($elems, arguments);
                        }
                    });
                } else { //client-side validation error
                    if(typeof config.error === 'function') {
                        config.error.call($elems, errors);
                    }
                }
            return this;
        }

        //return jquery object
        return this.each(function () {
            var $this = $(this), 
                data = $this.data(datakey), 
                options = typeof option === 'object' && option;

            //for delegated targets do not store `editable` object for element
            //it's allows several different selectors.
            //see: https://github.com/vitalets/x-editable/issues/312    
            if(options && options.selector) {
                data = new Editable(this, options);
                return; 
            }    
            
            if (!data) {
                $this.data(datakey, (data = new Editable(this, options)));
            }

            if (typeof option === 'string') { //call method 
                data[option].apply(data, Array.prototype.slice.call(args, 1));
            } 
        });
    };    
            

    $.fn.editable.defaults = {
        /**
        Type of input. Can be <code>text|textarea|select|date|checklist</code> and more

        @property type 
        @type string
        @default 'text'
        **/
        type: 'text',        
        /**
        Sets disabled state of editable

        @property disabled 
        @type boolean
        @default false
        **/         
        disabled: false,
        /**
        How to toggle editable. Can be <code>click|dblclick|mouseenter|manual</code>.   
        When set to <code>manual</code> you should manually call <code>show/hide</code> methods of editable.    
        **Note**: if you call <code>show</code> or <code>toggle</code> inside **click** handler of some DOM element, 
        you need to apply <code>e.stopPropagation()</code> because containers are being closed on any click on document.
        
        @example
        $('#edit-button').click(function(e) {
            e.stopPropagation();
            $('#username').editable('toggle');
        });

        @property toggle 
        @type string
        @default 'click'
        **/          
        toggle: 'click',
        /**
        Text shown when element is empty.

        @property emptytext 
        @type string
        @default 'Empty'
        **/         
        emptytext: 'Empty',
        /**
        Allows to automatically set element's text based on it's value. Can be <code>auto|always|never</code>. Useful for select and date.
        For example, if dropdown list is <code>{1: 'a', 2: 'b'}</code> and element's value set to <code>1</code>, it's html will be automatically set to <code>'a'</code>.  
        <code>auto</code> - text will be automatically set only if element is empty.  
        <code>always|never</code> - always(never) try to set element's text.

        @property autotext 
        @type string
        @default 'auto'
        **/          
        autotext: 'auto', 
        /**
        Initial value of input. If not set, taken from element's text.  
        Note, that if element's text is empty - text is automatically generated from value and can be customized (see `autotext` option).  
        For example, to display currency sign:
        @example
        <a id="price" data-type="text" data-value="100"></a>
        <script>
        $('#price').editable({
            ...
            display: function(value) {
              $(this).text(value + '$');
            } 
        }) 
        </script>
                
        @property value 
        @type mixed
        @default element's text
        **/
        value: null,
        /**
        Callback to perform custom displaying of value in element's text.  
        If `null`, default input's display used.  
        If `false`, no displaying methods will be called, element's text will never change.  
        Runs under element's scope.  
        _**Parameters:**_  
        
        * `value` current value to be displayed
        * `response` server response (if display called after ajax submit), since 1.4.0
         
        For _inputs with source_ (select, checklist) parameters are different:  
          
        * `value` current value to be displayed
        * `sourceData` array of items for current input (e.g. dropdown items) 
        * `response` server response (if display called after ajax submit), since 1.4.0
                  
        To get currently selected items use `$.fn.editableutils.itemsByValue(value, sourceData)`.
        
        @property display 
        @type function|boolean
        @default null
        @since 1.2.0
        @example
        display: function(value, sourceData) {
           //display checklist as comma-separated values
           var html = [],
               checked = $.fn.editableutils.itemsByValue(value, sourceData);
               
           if(checked.length) {
               $.each(checked, function(i, v) { html.push($.fn.editableutils.escape(v.text)); });
               $(this).html(html.join(', '));
           } else {
               $(this).empty(); 
           }
        }
        **/          
        display: null,
        /**
        Css class applied when editable text is empty.

        @property emptyclass 
        @type string
        @since 1.4.1        
        @default editable-empty
        **/        
        emptyclass: 'editable-empty',
        /**
        Css class applied when value was stored but not sent to server (`pk` is empty or `send = 'never'`).  
        You may set it to `null` if you work with editables locally and submit them together.  

        @property unsavedclass 
        @type string
        @since 1.4.1        
        @default editable-unsaved
        **/        
        unsavedclass: 'editable-unsaved',
        /**
        If selector is provided, editable will be delegated to the specified targets.  
        Usefull for dynamically generated DOM elements.  
        **Please note**, that delegated targets can't be initialized with `emptytext` and `autotext` options, 
        as they actually become editable only after first click.  
        You should manually set class `editable-click` to these elements.  
        Also, if element originally empty you should add class `editable-empty`, set `data-value=""` and write emptytext into element:

        @property selector 
        @type string
        @since 1.4.1        
        @default null
        @example
        <div id="user">
          <!-- empty -->
          <a href="#" data-name="username" data-type="text" class="editable-click editable-empty" data-value="" title="Username">Empty</a>
          <!-- non-empty -->
          <a href="#" data-name="group" data-type="select" data-source="/groups" data-value="1" class="editable-click" title="Group">Operator</a>
        </div>     
        
        <script>
        $('#user').editable({
            selector: 'a',
            url: '/post',
            pk: 1
        });
        </script>
        **/         
        selector: null,
        /**
        Color used to highlight element after update. Implemented via CSS3 transition, works in modern browsers.
        
        @property highlight 
        @type string|boolean
        @since 1.4.5        
        @default #FFFF80 
        **/
        highlight: '#FFFF80'        
    };
    
}(window.jQuery));
