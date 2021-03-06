import {
  Component,
  Input,
  OnInit,
  ContentChildren,
  QueryList,
  AfterContentInit
} from '@angular/core';
import { Http, HTTP_PROVIDERS, Response } from '@angular/http';
import { GridOptions, RowStyleCallback } from './grid-options';
import { GridColumnComponent } from './grid-column.component';
import { GridCellRendererComponent } from './grid-cell-renderer.component';
import { GridDataProvider } from './grid-data-provider';
import * as _ from 'lodash';
import 'rxjs/Rx';

/**
 * Data grid component class.
 * Use as directive. Component configuration is done through the options property.
 * Supports sorting, filtering and paging.
 *
 * @author Branimir Borisov <branimir@raketasoft.com>
 * @since 1.0.0-alpha
 */
@Component({
  selector: 'ng-grid',
  template: `
<div class="ng-grid">
  <div class="ng-grid-header" [style.width]="options.get('width')"
      [class.scroll]="options.get('height')">
    <table [class]="getHeadingCssClass()" [style.width]="options.get('width')">
      <thead *ngIf="options.get('heading')">
        <tr>
          <th *ngIf="options.get('selection')" class="ng-grid-heading selection">
            <input #selectAll type="checkbox"
                [ngModel]="allItemsSelected()"
                (click)="onSelectAllCheckboxClick(selectAll.checked)">
          </th>
          <th *ngFor="let column of columns" class="ng-grid-heading"
              [style.width]="column.width"
              [class.sort]="isSortedBy(column)"
              [class.sort-asc]="isSortedBy(column, 'asc')"
              [class.sort-desc]="isSortedBy(column, 'desc')"
              [class.sort-disable]="!isSortingAllowed(column)"
              (click)="onHeadingClick(column)">
            {{column.resolveHeading()}}
          </th>
        </tr>
      </thead>
      <tbody *ngIf="options.get('filtering')">
        <tr>
          <td *ngIf="options.get('selection')" class="ng-grid-filter selection"></td>
          <td *ngFor="let column of columns" class="ng-grid-filter">
            <input type="text" *ngIf="isTextFilterEnabled(column)"
                (keyup.enter)="onInputFilterEnter($event, column)"
                (blur)="onInputFilterBlur($event, column)" />
            <select *ngIf="isSelectFilterEnabled(column)"
                [ngModel]="getFilter(column.name)"
                (ngModelChange)="onSelectFilterChange($event, column)">
              <option></option>
              <option *ngFor="let item of column.items"
                  [value]="item[column.valueField]">
                {{item[column.textField]}}
              </option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="ng-grid-body" [style.width]="options.get('width')"
      [class.scroll]="options.get('height')" [style.max-height]="options.get('height')">
    <table [class]="getBodyCssClass()" [style.width]="options.get('width')">
      <tbody>
        <tr *ngFor="let row of getResults(); let i = index"
            [class]="getRowCssClass(i, row)"
            (click)="onRowClick(row)">
          <td *ngIf="options.get('selection')" class="ng-grid-cell selection">
            <input type="checkbox"
                [ngModel]="row.selected"
                (click)="onSelectItemCheckboxClick($event, row)">
          </td>
          <td *ngFor="let column of columns" class="ng-grid-cell"
              [style.width]="column.width"
              [style.text-align]="column.textAlign">
            <span *ngIf="column.template">
              <ng-grid-cell-renderer [column]="column" [data]="row">
              </ng-grid-cell-renderer>
            </span>
            <span *ngIf="!column.template">
              {{column.resolveCell(row)}}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="ng-grid-footer clearfix">
    <div class="ng-grid-pager {{options.get('pageElementPosition')}}" *ngIf="options.paging">
      <span>Pages:</span>
      <a href="#" *ngIf="getPageIndex() > 1" [attr.data-page]="1"
        (click)="onPageButtonClick($event)">First</a>
      <a href="#" *ngIf="getPageIndex() > 1" [attr.data-page]="getPageIndex() - 1"
        (click)="onPageButtonClick($event)">Prev</a>
      <template ngFor let-page [ngForOf]="pages">
        <a href="#" *ngIf="page != getPageIndex()" [attr.data-page]="page"
          (click)="onPageButtonClick($event)">{{page}}</a>
        <span *ngIf="page == getPageIndex()">{{page}}</span>
      </template>
      <a href="#" *ngIf="getPageIndex() < getTotalPages()"
        [attr.data-page]="getPageIndex() + 1"
        (click)="onPageButtonClick($event)">Next</a>
      <a href="#" *ngIf="getPageIndex() < getTotalPages()"
        [attr.data-page]="getTotalPages()"
        (click)="onPageButtonClick($event)">Last</a>
      <span>{{getPageIndex()}} of {{getTotalPages()}}</span>
    </div>
    <div class="ng-grid-pager-size {{options.get('pageSizeElementPosition')}}"
      *ngIf="isPageSizeOptionsEnabled()">
      <span>Page size:</span>
      <select [ngModel]="getPageSize()"
        (ngModelChange)="onPageSizeDropDownChange($event)">
        <option *ngFor="let value of options.get('pageSizeOptions')"
            [value]="value">
          {{value}}
        </option>
      </select>
    </div>
  </div>
</div>`,
  providers: [HTTP_PROVIDERS],
  directives: [GridCellRendererComponent]
})
export class GridComponent implements OnInit, AfterContentInit {
  static ROW_ALT_CLASS: string = 'alt';
  static ROW_HOVER_CLASS: string = 'hover';
  static ROW_SELECT_CLASS: string = 'select';

  @Input() options: GridOptions;
  @ContentChildren(GridColumnComponent) columnList: QueryList<GridColumnComponent>;

  private columns: Array<GridColumnComponent>;
  private data: Array<any>;
  private filters: Array<any> = [];
  private dataProvider: GridDataProvider;
  private pages: Array<number>;
  private selectedItems: Array<any> = [];

  /**
   * Class constructor.
   *
   * @param {Http} http
   */
  constructor(private http: Http) {
    this.http = http;
  }

  /**
   * Handle OnInit event.
   */
  ngOnInit() {
    if (_.isUndefined(this.options)) {
      this.options = new GridOptions();
    }
    if (!_.isUndefined(this.options.get('httpService'))) {
      this.http = this.options.get('httpService');
    }
    this.data = this.options.get('data');
    this.initDataProvider();
    this.render();
  }

  /**
   * Handle AfterViewInit event.
   */
  ngAfterContentInit() {
    this.columns = this.columnList.toArray();
  }

  /**
   * Set all data bound to the grid.
   *
   * @returns {Array<any>}
   */
  setData(data: Array<any>) {
    this.data = this.dataProvider.sourceData = data;
  }

  /**
   * Return all data bound to the grid.
   *
   * @returns {Array<any>}
   */
  getData(): Array<any> {
    return this.data;
  }

  /**
   * Return number of total results.
   *
   * @returns {number}
   */
  getTotalCount(): number {
    return this.dataProvider.getTotalCount();
  }

  /**
   * Return number of total results.
   *
   * @param {number} totalCount
   */
  setTotalCount(totalCount: number) {
    this.dataProvider.setTotalCount(totalCount);
  }

  /**
   * Set the results displayed in current page.
   *
   * @params {Array<any>} results
   */
  setResults(results: Array<any>) {
    this.dataProvider.setData(results);
  }

  /**
   * Return results displayed on current page.
   *
   * @returns {Array<any>}
   */
  getResults(): Array<any> {
    return this.dataProvider.getData();
  }

  /**
   * Return number of results displayed on current page.
   *
   * @returns {number}
   */
  getCount(): number {
    return this.dataProvider.getCount();
  }

  /**
   * Return current page index.
   *
   * @returns {number}
   */
  getPageIndex(): number {
    return this.dataProvider.pageIndex;
  }

  /**
   * Render data for given page.
   *
   * @param {number} pageIndex
   */
  setPageIndex(pageIndex: number) {
    this.dataProvider.pageIndex = pageIndex;
  }

  /**
   * Return current page size.
   *
   * @returns {number|false}
   */
  getPageSize(): any {
    return this.dataProvider.pageSize;
  }

  /**
   * Change page size to given value and render data.
   *
   * @param {number|false} pageSize
   */
  setPageSize(pageSize: any) {
    this.dataProvider.pageSize = pageSize;
    this.setPageIndex(1);
  }

  /**
   * Return total number of grid pages.
   *
   * @returns {number}
   */
  getTotalPages(): number {
    if (this.getPageSize() === false || this.getPageSize() > this.getTotalCount()) {
      return 1;
    }

    return Math.ceil(this.getTotalCount() / this.getPageSize());
  }

  /**
   * Add a filter value for specific column.
   *
   * @param {string} columnName
   * @param {string} value Keyword to be used as filter for the column
   */
  setFilter(columnName: string, value: string) {
    if (!_.isEmpty(value)) {
      this.filters[columnName] = value;
      if (!_.isUndefined(this.options.get('url'))) {
        this.dataProvider.requestParams[columnName] = value;
      }
    } else if (!_.isEmpty(this.filters[columnName])) {
      delete this.filters[columnName];
      if (!_.isUndefined(this.options.get('url'))) {
        delete this.dataProvider.requestParams[columnName];
      }
    }
    this.setPageIndex(1);
  }

  /**
   * Return filter value for given column.
   *
   * @param {string} columnName
   * @returns {any}
   */
  getFilter(columnName: string): any {
    return this.filters[columnName];
  }

  /**
   * Calling this method would sort the grid data by the given sort column and
   * sort type.
   *
   * @param {string} sortColumn Name of grid column to be used for sorting
   * @param {string} sortType Optional, values are 'asc' or 'desc'
   */
  setSort(sortColumn: string, sortType?: string) {
    this.dataProvider.setSort(sortColumn, sortType);
  }

  /**
   * Return a list of selected grid items.
   *
   * @returns {Array<any>}
   */
  getSelectedItems(): Array<any> {
    return this.selectedItems;
  }

  /**
   * Render grid.
   */
  render() {
    if (_.isUndefined(this.options.get('url'))) {
      this.filter();
      this.clearSelection();
      this.paginate();
    } else {
      this.dataProvider.fetch().subscribe(
        (res: Response) => {
          this.clearSelection();
          this.paginate();
        },
        (err: any) => {
          console.log(err);
        }
      );
    }
  }

  /**
   * Filter provided data.
   */
  protected filter() {
    var self: GridComponent = this;

    this.dataProvider.sourceData = _.filter(this.data, function(item: any) {
      var match: boolean = true;
      for (let filter in self.filters) {
        let value: string = _.get(item, filter).toString();

        match = match &&
          !_.isEmpty(value.match(new RegExp(self.filters[filter], 'i')));
      }

      return match;
    });
  }

  /**
   * Check if text filter is enabled for given column.
   *
   * @param {GridColumnComponent} column
   * @returns {boolean}
   */
  protected isTextFilterEnabled(column: GridColumnComponent) {
    return (column.type == GridColumnComponent.COLUMN_TYPE_TEXT
        && column.filtering == true);
  }

  /**
   * Check if select filter is enabled for given column.
   *
   * @param {GridColumnComponent} column
   * @returns {boolean}
   */
  protected isSelectFilterEnabled(column: GridColumnComponent) {
    return (column.type == GridColumnComponent.COLUMN_TYPE_SELECT
        && column.filtering == true);
  }

  /**
   * Determine the CSS class that needs to be applied to the each grid row.
   *
   * @param {number} index Row index
   * @param {any} row Row data
   * @returns {string} Row color
   */
  protected getRowCssClass(index: number, row: any) {
    let cssClass: string = '';
    if (this.options.get('rowAlternateStyle') && index % 2 !== 0) {
      cssClass = this.concatCssClass(cssClass, GridComponent.ROW_ALT_CLASS);
    }
    if (this.options.get('rowHoverStyle')) {
      cssClass = this.concatCssClass(cssClass, GridComponent.ROW_HOVER_CLASS);
    }

    let callback: RowStyleCallback = this.options.get('rowStyleCallback');
    if (!_.isUndefined(callback)) {
      cssClass = this.concatCssClass(cssClass, callback(row));
    }

    if (row.selected && this.options.get('rowSelectionStyle')) {
      cssClass = this.concatCssClass(cssClass, GridComponent.ROW_SELECT_CLASS);
    }

    return cssClass;
  }

  /**
   * Get heading css class.
   *
   * @returns {string}
   */
  protected getHeadingCssClass(): string {
    if (_.isUndefined(this.options.get('headingCssClass'))) {
      return '';
    }

    return this.options.get('headingCssClass');
  }

  /**
   * Get body css class.
   *
   * @returns {string}
   */
  protected getBodyCssClass(): string {
    if (_.isUndefined(this.options.get('bodyCssClass'))) {
      return '';
    }

    return this.options.get('bodyCssClass');
  }

  /**
   * Handle select/deselect all grid rows.
   *
   * @param {boolean} selected
   */
  protected onSelectAllCheckboxClick(selected: boolean) {
    for (let row of this.getResults()) {
      this.setRowSelection(row, selected);
    }
  }

  /**
   * Handle row select checkbox click.
   *
   * @param {MouseEvent} event
   * @param {any} row
   */
  protected onSelectItemCheckboxClick(e: MouseEvent, row: any) {
    e.stopPropagation();
    this.setRowSelection(row);
  }

  /**
   * Check if all results on current page are selected.
   *
   * @returns {boolean}
   */
  protected allItemsSelected(): boolean {
    if (this.getSelectedItems().length > 0
      && this.getResults().length === this.getSelectedItems().length) {
      return true;
    }

    return false;
  }

  /**
   * Handle grid row click event.
   *
   * @param {any} row
   */
  protected onRowClick(row: any) {
    if (this.options.get('selection')) {
      this.setRowSelection(row);
    }
  }

  /**
   * Initialize data provider based on grid options.
   */
  protected initDataProvider() {
    this.dataProvider = new GridDataProvider(this.http, {
      pageParam: this.options.get('pageParam'),
      pageSizeParam: this.options.get('pageSizeParam'),
      pageSize: this.options.get('defaultPageSize'),
      requestParams: this.options.get('additionalRequestParams'),
      sortParam: this.options.get('sortParam'),
      sourceData: this.options.get('data'),
      sourceUrl: this.options.get('url'),
      totalCountHeader: this.options.get('totalCountHeader')
    });

    if (!_.isUndefined(this.options.get('defaultSortColumn'))) {
      this.setSort(
        this.options.get('defaultSortColumn'),
        this.options.get('defaultSortType')
      );
    }
  }

  /**
   * Build a list of the pages that should be display in the grid, based on
   * current page index and max button count.
   */
  protected paginate() {
    if (this.options.get('paging')) {
      let pageButtonCount: number = Math.min(
        this.options.get('pageButtonCount'),
        this.getTotalPages()
      );
      let offsetLeft: number = Math.floor(pageButtonCount / 2);
      let offsetRight: number = Math.ceil(pageButtonCount / 2) - 1;
      let startIndex: number = this.getPageIndex() - offsetLeft;
      let endIndex: number = this.getPageIndex() + offsetRight;

      if (startIndex < 1) {
        startIndex = 1;
        endIndex = pageButtonCount;
      } else if (endIndex > this.getTotalPages()) {
        endIndex = this.getTotalPages();
        startIndex = endIndex - pageButtonCount + 1;
      }

      this.pages = [];
      for (let i: number = startIndex; i <= endIndex; i++) {
        this.pages.push(i);
      }
    }
  }

  /**
   * Page button click handler.
   * When invoked grid data for specific page would be rendered.
   *
   * @param {MouseEvent} event
   */
  protected onPageButtonClick(event: MouseEvent) {
    event.preventDefault();

    let element: HTMLSelectElement = event.target as HTMLSelectElement;
    let pageIndex: number = Number(element.getAttribute('data-page'));

    this.setPageIndex(pageIndex);
    this.render();
  }

  /**
   * Check if page size options are enabled.
   *
   * @returns {boolean}
   */
  protected isPageSizeOptionsEnabled(): boolean {
    return this.options.get('paging')
      && (!_.isEmpty(this.options.get('pageSizeOptions'))
        || this.options.get('pageSizeOptions') !== false);
  }

  /**
   * Page size drop-down change handler.
   * When invoked the page size of the grid would be changed and data would be
   * re-rendered.
   *
   * @param {any} event
   */
  protected onPageSizeDropDownChange(event: any) {
    this.setPageSize(event);
    this.render();
  }

  /**
   * Select filter change handler.
   * When invoked a filter would be set with the input value.
   *
   * @param {any} event
   * @param {GridColumnComponent} column
   */
  protected onSelectFilterChange(event: any, column: GridColumnComponent) {
    this.setFilter(column.name, event);
    this.render();
  }


  /**
   * Input filter blur handler.
   * When invoked a filter would be set with the input value.
   *
   * @param {MouseEvent} event
   * @param {GridColumnComponent} column
   */
  protected onInputFilterBlur(event: MouseEvent, column: GridColumnComponent) {
    let element: HTMLInputElement = event.target as HTMLInputElement;
    let keyword: string = element.value.trim();

    this.setFilter(column.name, keyword);
  }

  /**
   * Input filter enter key hanlder.
   * When invoked a filter would be set with the input value and the grid
   * filter would be triggered.
   *
   * @param {MouseEvent} event
   * @param {GridColumnComponent} column
   */
  protected onInputFilterEnter(event: MouseEvent, column: GridColumnComponent) {
    this.onInputFilterBlur(event, column);

    this.render();
  }

  /**
   * Grid heading click handler.
   * When invoked the grid would be sorted by the clicked column.
   *
   * @param {GridColumnComponent} column
   */
  protected onHeadingClick(column: GridColumnComponent) {
    if (this.isSortingAllowed(column)) {
      this.setSort(column.name, this.getSortType(column));
      this.render();
    } else {
      console.log('Sorting by "' + column.name + '" is not allowed.');
    }
  }

  /**
   * Check if data is sorted by specific column and type.
   *
   * @param {GridColumn} column
   * @param {string} sortType Optional, if given method would also check
   * current sort type value
   * @returns {boolean}
   */
  protected isSortedBy(column: GridColumnComponent, sortType?: string): boolean {
    if (!(column.sorting === true)) {
      return false;
    }

    let isOrderedByField: boolean =
        column.name === this.dataProvider.getSortColumn();

    if (_.isUndefined(sortType)) {
      return isOrderedByField;
    }

    return isOrderedByField && this.dataProvider.getSortType() === sortType;
  }

  /**
   * Determine sort type by column name.
   * If column name is different from current sort column the order type would
   * be preserved, otherwise the sort type would be changed to the opposite.
   *
   * @param {GridColumn} column
   * @returns {string}
   */
  protected getSortType(column: GridColumnComponent): string {
    return column.name !== this.dataProvider.getSortColumn() ?
      this.dataProvider.getSortType() :
        (this.dataProvider.getSortType() === GridDataProvider.SORT_ASC ?
          GridDataProvider.SORT_DESC : GridDataProvider.SORT_ASC);
  }

  /**
   * Check if sorting is allowed for specific grid column.
   *
   * @param {GridColumn} column
   * @returns {boolean}
   */
  protected isSortingAllowed(column: GridColumnComponent): boolean {
    return this.options.get('sorting') && column.sorting == true;
  }

  /**
   * Determine the column name used in column options.
   *
   * @param {string} key Data item key
   * @param {any} row Data item, could be primitive data type or an object
   * @returns {string}
   */
  protected getColumnName(key: string, row: any): string {
    if (_.isObject(row[key])) {
      return key.concat('.', this.getNestedKey(row[key]));
    }

    return key;
  }

  /**
   * Concat css class name to another using space.
   *
   * @param {string} cssClass
   * @param {string} addition
   * @returns {string}
   */
  private concatCssClass(cssClass: string, addition: string): string {
    return cssClass + (cssClass.length ? ' ' : '') + addition;
  }

  /**
   * Clear selected items array.
   */
  private clearSelection() {
    for (let row of this.getResults()) {
      if (row.selected) {
        row.selected = false;
      }
    }

    while (this.selectedItems.length > 0) {
      this.selectedItems.pop();
    }
  }

  /**
   * Handle select/deselect a single grid row.
   *
   * @param {any} row
   * @param {boolean} value
   */
  private setRowSelection(row: any, value?: boolean) {
    let selected: boolean = !_.isUndefined(value) ? value :
      (_.isUndefined(row.selected) || !row.selected ? true : false);

    row.selected = selected;

    if (row.selected) {
      if (!this.isRowSelected(row)) {
        this.selectedItems.push(row);
      }
    } else {
      this.selectedItems.splice(this.selectedItems.indexOf(row), 1);
    }
  }

  /**
   * Check if row is selected.
   *
   * @param {any} row
   * @returns boolean
   */
  private isRowSelected(row: any): boolean {
    return this.selectedItems.find(function(item: any) {
      return item == row;
    });
  }

  /**
   * Get full key name from nested object.
   *
   * @param {any} object Nested object to be iterated
   * @returns {string}
   * @example
   * var object: any = {country: { name: { officialName: "People's Republic of China", name: "China" }, id: 6 }}
   * var nestedKey: string = this.getNestedKey(object);
   * console.log(nestedKey); // will output 'country.name.officialName'
   */
  private getNestedKey(object: any): string {
    let firstKey: string = _.keys(object)[0];
    let firstKeyValue: any = object[firstKey];

    if (_.isObject(firstKeyValue)) {
      firstKey.concat('.', this.getNestedKey(firstKeyValue));
    }

    return firstKey;
  }
}
